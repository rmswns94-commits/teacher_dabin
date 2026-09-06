"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  createExamPlanAction,
  deleteExamPlanAction,
  setExamPlanCompletedAction,
  updateExamPlanAction,
} from "@/app/exams/plan-actions";
import { addMonths, dayOfWeekOf, monthLabel } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import { examDdayInfo } from "@/lib/school-exam-display";
import type { ExamPrepPlanRecord } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// ── 시험 대비 월간 플래너 ─────────────────────────────────────────────
// iPad Landscape 우선: 실제 container width 기준(@container query)으로만 밀도를 바꾼다 —
// userAgent/orientation JS 분기 없음, resize에도 component tree 교체/remount 없음.
// 계획 데이터는 시험 단위 전체를 서버에서 1회 batch로 받아 client state가 단일 소스:
// 월 이동은 추가 fetch가 없어(race 원천 차단) 즉시이고, 완료 toggle은 optimistic + 절대값 set.

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

// 월요일 시작 월간 grid (기존 buildMonthGrid는 일요일 시작 — 플래너는 수업 흐름에 맞춰 월요일 시작)
function buildMondayGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const firstOffset = (dayOfWeekOf(`${month}-01`) + 6) % 7; // 0 = 월요일

  const cells: (string | null)[] = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}

type SheetMode = { type: "list" } | { type: "add" } | { type: "edit"; planId: string };

type PlanFormValues = { planDate: string; unitLabel: string; title: string; memo: string };

// 완료 체크 원형 버튼 — 시각은 작아도 hit area를 확보한다 (cell ~36px, Sheet 44px)
function CheckCircle({
  completed,
  title,
  disabled,
  onToggle,
  size,
}: {
  completed: boolean;
  title: string;
  disabled?: boolean;
  onToggle: () => void;
  size: "cell" | "sheet";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={completed}
      aria-label={`${title} 완료 표시`}
      onClick={(event) => {
        // 완료 toggle이 날짜 Sheet open(셀 클릭)과 겹치지 않게 분리
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "cell" ? "-my-1.5 -ml-1 h-9 w-8" : "h-11 w-11 -my-1",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-full border-2 transition",
          size === "cell" ? "h-[15px] w-[15px]" : "h-[19px] w-[19px]",
          completed
            ? "border-[#8fc7ab] bg-[#8fc7ab] text-white"
            : "border-[#cdbfe8] bg-white",
        )}
      >
        {completed ? (
          <svg viewBox="0 0 10 10" className={size === "cell" ? "h-2 w-2" : "h-2.5 w-2.5"} fill="none">
            <path d="M1.5 5.5L4 8l4.5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

// Sheet 내부 등록/수정 폼 — Sheet 폭이 좁아 전 필드 1열 w-full (2열 강제 금지).
// responsive 전환으로 인스턴스가 바뀌지 않도록 부모에서 mode가 유지되는 동안 계속 마운트된다.
function PlanForm({
  initial,
  isPending,
  error,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  onDirtyChange,
}: {
  initial: PlanFormValues;
  isPending: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (values: PlanFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [planDate, setPlanDate] = useState(initial.planDate);
  const [unitLabel, setUnitLabel] = useState(initial.unitLabel);
  const [title, setTitle] = useState(initial.title);
  const [memo, setMemo] = useState(initial.memo);

  const markDirty = () =>
    onDirtyChange(
      planDate !== initial.planDate ||
        unitLabel !== initial.unitLabel ||
        title !== initial.title ||
        memo !== initial.memo,
    );

  return (
    <div className="space-y-3">
      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-semibold text-[#7c6d69]">날짜</span>
        <input
          type="date"
          value={planDate}
          onChange={(event) => {
            setPlanDate(event.target.value);
            onDirtyChange(true);
          }}
          className="min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
          aria-label="계획 날짜"
        />
      </label>

      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-semibold text-[#7c6d69]">단원/구분 (선택)</span>
        <input
          value={unitLabel}
          onChange={(event) => {
            setUnitLabel(event.target.value);
            markDirty();
          }}
          maxLength={30}
          placeholder="5과"
          className="min-h-[44px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9b9e8]"
        />
      </label>

      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-semibold text-[#7c6d69]">할 내용</span>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            markDirty();
          }}
          maxLength={120}
          placeholder="백발백중 문법 오답 풀이"
          className="min-h-[44px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9b9e8]"
        />
      </label>

      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-semibold text-[#7c6d69]">메모 (선택)</span>
        <textarea
          value={memo}
          onChange={(event) => {
            setMemo(event.target.value);
            markDirty();
          }}
          rows={2}
          maxLength={500}
          className="w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#c9b9e8]"
        />
      </label>

      {error ? (
        <div className="rounded-xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending || !title.trim() || !planDate}
          onClick={() => onSubmit({ planDate, unitLabel, title, memo })}
          className="min-h-[44px] flex-1 rounded-xl bg-[#2b2b31] px-3 text-sm font-medium text-white transition hover:bg-[#3a3a42] disabled:opacity-50"
        >
          {isPending ? "저장 중..." : submitLabel}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onCancel}
          className="min-h-[44px] rounded-xl border border-[#ece0db] bg-white px-3 text-sm text-[#7c6d69] transition hover:bg-[#faf6f3]"
        >
          취소
        </button>
      </div>

      {onDelete ? (
        <button
          type="button"
          disabled={isPending}
          onClick={onDelete}
          className="min-h-[40px] w-full rounded-xl px-3 text-xs text-[#8f625f] transition hover:bg-[#fff5f2]"
        >
          이 계획 삭제
        </button>
      ) : null}
    </div>
  );
}

export function ExamPlanner({
  examId,
  examStart,
  examEnd,
  examTypeLabel,
  today,
  initialPlans,
}: {
  examId: string;
  examStart: string;
  examEnd: string;
  examTypeLabel: string;
  today: string; // KST "YYYY-MM-DD" (서버 계산 — client timezone에 의존하지 않는다)
  initialPlans: ExamPrepPlanRecord[];
}) {
  const [plans, setPlans] = useState<ExamPrepPlanRecord[]>(initialPlans);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null); // null = Sheet 닫힘
  const [toggleError, setToggleError] = useState("");
  const [formError, setFormError] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const plansByDate = useMemo(() => {
    const map = new Map<string, ExamPrepPlanRecord[]>();
    for (const plan of plans) {
      map.set(plan.plan_date, [...(map.get(plan.plan_date) ?? []), plan]);
    }
    return map;
  }, [plans]);

  const weeks = useMemo(() => buildMondayGrid(month), [month]);
  const completedCount = plans.filter((plan) => plan.completed).length;
  const totalCount = plans.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const dday = examDdayInfo(today, examStart, examEnd);

  // 완료 toggle: local 즉시 반영(optimistic) + 서버는 절대값 set(멱등 — 더블탭 안전).
  // Calendar 재조회/refresh 없음. 실패 시 이전 값으로 rollback.
  const toggleCompleted = (plan: ExamPrepPlanRecord) => {
    const previous = plan.completed;
    const next = !previous;
    setToggleError("");
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, completed: next } : p)));
    startTransition(async () => {
      const result = await setExamPlanCompletedAction(plan.id, next);
      if ("error" in result) {
        setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, completed: previous } : p)));
        setToggleError(result.error);
      }
    });
  };

  const requestCloseSheet = () => {
    if (formDirty && !window.confirm("작성 중인 계획이 있어요. 닫을까요?")) {
      return;
    }
    setSheetMode(null);
    setFormDirty(false);
    setFormError("");
  };

  const openList = (date: string) => {
    setSelectedDate(date);
    setSheetMode({ type: "list" });
    setFormError("");
    setFormDirty(false);
  };

  const submitCreate = (values: PlanFormValues) => {
    setFormError("");
    startTransition(async () => {
      const result = await createExamPlanAction(examId, values);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      // 해당 날짜 cell + progress만 local로 즉시 갱신 (전체 재조회 없음)
      setPlans((prev) => [...prev, result.plan]);
      setSelectedDate(result.plan.plan_date);
      setSheetMode({ type: "list" });
      setFormDirty(false);
    });
  };

  const submitUpdate = (planId: string, values: PlanFormValues) => {
    setFormError("");
    startTransition(async () => {
      const result = await updateExamPlanAction(planId, values);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setPlans((prev) => prev.map((p) => (p.id === planId ? result.plan : p)));
      setSelectedDate(result.plan.plan_date);
      setSheetMode({ type: "list" });
      setFormDirty(false);
    });
  };

  const removePlan = (plan: ExamPrepPlanRecord) => {
    if (!window.confirm(`'${plan.title}' 계획을 삭제할까요?`)) {
      return;
    }
    setFormError("");
    startTransition(async () => {
      const result = await deleteExamPlanAction(plan.id);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      setSheetMode({ type: "list" });
      setFormDirty(false);
    });
  };

  const sheetDate = selectedDate ?? today;
  const editingPlan =
    sheetMode?.type === "edit" ? plans.find((p) => p.id === sheetMode.planId) ?? null : null;

  // Sheet용 unit grouping (연속된 같은 단원은 라벨 한 번만 — DB는 unit_label 단순 field 그대로)
  const sheetGroups = useMemo(() => {
    const groups: { unit: string | null; items: ExamPrepPlanRecord[] }[] = [];
    for (const plan of plansByDate.get(sheetDate) ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.unit === (plan.unit_label ?? null)) {
        last.items.push(plan);
      } else {
        groups.push({ unit: plan.unit_label ?? null, items: [plan] });
      }
    }
    return groups;
  }, [plansByDate, sheetDate]);

  const navButton =
    "flex h-10 min-w-10 items-center justify-center rounded-xl border border-[#ece0db] bg-white px-2 text-sm font-medium text-[#564d4d] transition hover:bg-[#faf6f3]";

  return (
    <section
      className="@container rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-3 shadow-sm sm:p-4"
      aria-label="시험 대비 월간 플래너"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) {
          return;
        }
        if (event.key === "Escape" && sheetMode) {
          requestCloseSheet();
        }
      }}
    >
      {/* ── compact header: 월 + 이동 + D-Day + 진행률 + 계획 추가 (별도 대형 카드 금지) ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-[#2b2323]">
            {monthLabel(month)}
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${dday.className}`}
          >
            {dday.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="이전 달" className={navButton}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelectedDate(today);
            }}
            className={navButton}
          >
            오늘
          </button>
          <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="다음 달" className={navButton}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {totalCount > 0 ? (
            <div className="flex items-center gap-2" aria-label={`시험 대비 진행률 ${percent}%`}>
              <span className="text-xs tabular-nums text-[#564d4d]">
                시험 대비 <span className="font-semibold text-[#2b2323]">{completedCount}/{totalCount}</span> · {percent}%
              </span>
              <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-[#efe8e2] @min-[560px]:block">
                <div
                  className="h-full rounded-full bg-[#8fc7ab] transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSelectedDate((prev) => prev ?? today);
              setSheetMode({ type: "add" });
              setFormError("");
            }}
            className="flex min-h-[40px] items-center gap-1 rounded-xl border border-[#ddd0ec] bg-[#f9f5fd] px-3 text-xs font-medium text-[#6d5aa8] transition hover:bg-[#f3ecfa]"
          >
            <Plus className="h-3.5 w-3.5" /> 계획 추가
          </button>
        </div>
      </div>

      {toggleError ? (
        <p className="px-1 pb-2 text-xs text-[#a2665f]">{toggleError}</p>
      ) : null}

      {/* ── Calendar + (넓으면 우측 Sheet) — 같은 component tree, CSS container query로만 전환 ── */}
      <div className="flex min-w-0 items-start">
        <div className="@container min-w-0 flex-1">
          {/* 요일 헤더 (월요일 시작) */}
          <div className="grid grid-cols-7 border-b border-[#eee3dc] pb-1.5">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "px-1.5 text-center text-[11px] font-semibold @min-[760px]:text-left @min-[760px]:text-xs",
                  index === 5 ? "text-[#5c7ea6]" : index === 6 ? "text-[#b06a84]" : "text-[#8a7b77]",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7">
              {week.map((date, dayIndex) => {
                if (!date) {
                  return (
                    <div
                      key={`empty-${dayIndex}`}
                      className="border-b border-r border-[#f3eae3] bg-[#fbf8f4]/60 first:border-l"
                    />
                  );
                }

                const dayPlans = plansByDate.get(date) ?? [];
                const isToday = date === today;
                const inExamPeriod = date >= examStart && date <= examEnd;
                const isSelected = date === selectedDate;
                const dayNum = Number(date.slice(8));

                return (
                  <div
                    key={date}
                    role="button"
                    tabIndex={0}
                    aria-label={`${formatKoreanDate(date, true)} 계획 ${dayPlans.length}개`}
                    onClick={() => openList(date)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        openList(date);
                      }
                    }}
                    className={cn(
                      "min-h-[88px] min-w-0 cursor-pointer border-b border-r border-[#f3eae3] px-1 py-1 text-left align-top transition first:border-l @min-[540px]:min-h-[100px] @min-[760px]:min-h-[116px] @min-[760px]:px-1.5",
                      inExamPeriod ? "bg-[#fbeef3]/55" : "bg-white hover:bg-[#faf7f3]",
                      isSelected && "ring-1 ring-inset ring-[#c9b9e8]",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                          isToday
                            ? "bg-[#8b7ae6] text-white"
                            : dayIndex === 5
                              ? "text-[#5c7ea6]"
                              : dayIndex === 6
                                ? "text-[#b06a84]"
                                : "text-[#453b3b]",
                        )}
                      >
                        {dayNum}
                      </span>
                      {date === examStart ? (
                        <span className="hidden min-w-0 truncate text-[10px] font-semibold text-[#a05a7c] @min-[540px]:block">
                          {examTypeLabel} 시작
                        </span>
                      ) : inExamPeriod ? (
                        <span aria-hidden className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-[#e4a9c0] @min-[540px]:block" />
                      ) : null}
                    </div>

                    {dayPlans.length > 0 ? (
                      <div className="mt-0.5 space-y-px">
                        {dayPlans.slice(0, 3).map((plan, planIndex) => (
                          <div
                            key={plan.id}
                            className={cn(
                              "flex min-w-0 items-center",
                              planIndex === 1 && "hidden @min-[540px]:flex",
                              planIndex === 2 && "hidden @min-[760px]:flex",
                            )}
                          >
                            <CheckCircle
                              completed={plan.completed}
                              title={plan.title}
                              onToggle={() => toggleCompleted(plan)}
                              size="cell"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                // title 탭 = 수정 Sheet (완료 toggle과 별개 action)
                                event.stopPropagation();
                                setSelectedDate(date);
                                setSheetMode({ type: "edit", planId: plan.id });
                                setFormError("");
                              }}
                              className="block min-w-0 flex-1 truncate py-0.5 text-left text-[12px] leading-4"
                            >
                              {plan.unit_label ? (
                                <span className="mr-0.5 text-[11px] font-semibold text-[#6d5aa8]">
                                  {plan.unit_label}
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  plan.completed
                                    ? "text-[#9a8f8a] line-through decoration-[#c9beb8]"
                                    : "text-[#453b3b]",
                                )}
                              >
                                {plan.title}
                              </span>
                            </button>
                          </div>
                        ))}

                        {/* +N — 표시 가능한 개수는 container 폭에 따라 1/2/3개 (버튼 탭 = 날짜 Sheet) */}
                        {dayPlans.length > 1 ? (
                          <button type="button" onClick={(event) => { event.stopPropagation(); openList(date); }} className="rounded-md px-1 py-0.5 text-[11px] font-medium text-[#8b7ae6] @min-[540px]:hidden">
                            +{dayPlans.length - 1}
                          </button>
                        ) : null}
                        {dayPlans.length > 2 ? (
                          <button type="button" onClick={(event) => { event.stopPropagation(); openList(date); }} className="hidden rounded-md px-1 py-0.5 text-[11px] font-medium text-[#8b7ae6] @min-[540px]:inline-flex @min-[760px]:hidden">
                            +{dayPlans.length - 2}
                          </button>
                        ) : null}
                        {dayPlans.length > 3 ? (
                          <button type="button" onClick={(event) => { event.stopPropagation(); openList(date); }} className="hidden rounded-md px-1 py-0.5 text-[11px] font-medium text-[#8b7ae6] @min-[760px]:inline-flex">
                            +{dayPlans.length - 3}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── 날짜 Sheet: 넓은 container(≥820px)는 우측 고정 패널(Calendar context 유지),
              좁으면 우측 overlay drawer — 같은 인스턴스, CSS로만 전환 ── */}
        {sheetMode ? (
          <>
            <div
              aria-hidden
              onClick={requestCloseSheet}
              className="fixed inset-0 z-40 bg-[#2b2323]/25 @min-[820px]:hidden"
            />
            <aside
              role="dialog"
              aria-label={`${formatKoreanDate(sheetDate, true)} 시험 대비 계획`}
              className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,94vw)] flex-col border-l border-[#efe4dc] bg-[#fffdfb] shadow-2xl @min-[820px]:static @min-[820px]:z-auto @min-[820px]:ml-3 @min-[820px]:max-h-[720px] @min-[820px]:w-[360px] @min-[820px]:shrink-0 @min-[820px]:self-start @min-[820px]:rounded-2xl @min-[820px]:border @min-[820px]:shadow-none"
            >
              <div className="flex items-start justify-between gap-2 border-b border-[#f0e7e2] px-4 py-3">
                <div>
                  <div className="text-[15px] font-semibold text-[#2b2323]">
                    {formatKoreanDate(sheetDate, true)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8a7b77]">
                    {sheetMode.type === "add"
                      ? "계획 추가"
                      : sheetMode.type === "edit"
                        ? "계획 수정"
                        : "시험 대비 계획"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={requestCloseSheet}
                  aria-label="계획 패널 닫기"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-[#7a7a84] transition hover:bg-[#f4f4f6]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {sheetMode.type === "list" ? (
                  <div className="space-y-3">
                    {sheetGroups.length === 0 ? (
                      <p className="rounded-xl bg-[#f8f3ef] p-3 text-sm text-[#655d5d]">
                        이 날짜에는 아직 계획이 없어요.
                      </p>
                    ) : (
                      sheetGroups.map((group, groupIndex) => (
                        <div key={groupIndex}>
                          {group.unit ? (
                            <div className="mb-1 text-xs font-semibold text-[#6d5aa8]">{group.unit}</div>
                          ) : null}
                          <div className="space-y-0.5">
                            {group.items.map((plan) => (
                              <div key={plan.id} className="flex min-w-0 items-center gap-1">
                                <CheckCircle
                                  completed={plan.completed}
                                  title={plan.title}
                                  onToggle={() => toggleCompleted(plan)}
                                  size="sheet"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSheetMode({ type: "edit", planId: plan.id });
                                    setFormError("");
                                  }}
                                  className="min-w-0 flex-1 rounded-lg px-1 py-2 text-left transition hover:bg-[#faf6f3]"
                                >
                                  <span
                                    className={cn(
                                      "block text-sm leading-5",
                                      plan.completed
                                        ? "text-[#9a8f8a] line-through decoration-[#c9beb8]"
                                        : "text-[#2d2928]",
                                    )}
                                  >
                                    {plan.title}
                                  </span>
                                  {plan.memo ? (
                                    <span className="mt-0.5 block text-xs leading-4 text-[#8a7b77]">
                                      {plan.memo}
                                    </span>
                                  ) : null}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}

                    {formError ? <p className="text-xs text-[#a2665f]">{formError}</p> : null}

                    <button
                      type="button"
                      onClick={() => {
                        setSheetMode({ type: "add" });
                        setFormError("");
                      }}
                      className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#ddd0ec] bg-[#fbf9fd] text-sm font-medium text-[#6d5aa8] transition hover:bg-[#f3ecfa]"
                    >
                      <Plus className="h-4 w-4" /> 계획 추가
                    </button>
                  </div>
                ) : sheetMode.type === "add" ? (
                  <PlanForm
                    key={`add-${sheetDate}`}
                    initial={{ planDate: sheetDate, unitLabel: "", title: "", memo: "" }}
                    isPending={isPending}
                    error={formError}
                    submitLabel="계획 추가"
                    onSubmit={submitCreate}
                    onCancel={() => {
                      setSheetMode({ type: "list" });
                      setFormDirty(false);
                      setFormError("");
                    }}
                    onDirtyChange={setFormDirty}
                  />
                ) : editingPlan ? (
                  <PlanForm
                    key={`edit-${editingPlan.id}`}
                    initial={{
                      planDate: editingPlan.plan_date,
                      unitLabel: editingPlan.unit_label ?? "",
                      title: editingPlan.title,
                      memo: editingPlan.memo ?? "",
                    }}
                    isPending={isPending}
                    error={formError}
                    submitLabel="변경사항 저장"
                    onSubmit={(values) => submitUpdate(editingPlan.id, values)}
                    onCancel={() => {
                      setSheetMode({ type: "list" });
                      setFormDirty(false);
                      setFormError("");
                    }}
                    onDelete={() => removePlan(editingPlan)}
                    onDirtyChange={setFormDirty}
                  />
                ) : (
                  <p className="text-sm text-[#655d5d]">계획을 찾을 수 없어요.</p>
                )}
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}
