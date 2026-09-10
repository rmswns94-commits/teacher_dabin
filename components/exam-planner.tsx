"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  createExamPlanAction,
  deleteExamPlanAction,
  setExamPlanCompletedAction,
  updateExamPlanAction,
} from "@/app/exams/plan-actions";
import { addMonths, buildMonthGrid, monthLabel } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import { examDdayInfo, planProgressPercent } from "@/lib/school-exam-display";
import type { ExamPrepPlanRecord } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// ── 시험 대비 월간 플래너 ─────────────────────────────────────────────
// iPad Landscape 우선: 실제 container width 기준(@container query)으로만 밀도를 바꾼다 —
// userAgent/orientation JS 분기 없음, resize에도 component tree 교체/remount 없음.
// 계획 데이터는 시험 단위 전체를 서버에서 1회 batch로 받아 client state가 단일 소스:
// 월 이동은 추가 fetch가 없어(race 원천 차단) 즉시이고, 완료 toggle은 optimistic + 절대값 set.

// 스프링 노트 달력 디자인: 일요일 시작(SUN~SAT), 주말은 웜 레드 강조 (참고 디자인 기준)
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const WEEKEND_TEXT = "text-[#d95f4c]";

// 상단 스프링 코일 장식 (participate하지 않는 순수 decoration)
function SpringCoils() {
  return (
    <div aria-hidden className="pointer-events-none absolute -top-3.5 left-0 right-0 flex justify-around px-5">
      {Array.from({ length: 11 }, (_, i) => (
        <span
          key={i}
          className="h-7 w-2.5 rounded-full border border-[#a9c8e4] bg-gradient-to-b from-[#dcecf9] to-[#aecde9] shadow-[0_1px_2px_rgba(120,150,180,0.35)]"
        />
      ))}
    </div>
  );
}

type SheetMode = { type: "list" } | { type: "add" } | { type: "edit"; planId: string };

// MVP 입력은 날짜 + 할 내용 두 가지 (unit_label/memo는 legacy DB 컬럼으로만 보존)
type PlanFormValues = { planDate: string; title: string };

// 완료 체크 원형 버튼 — 시각은 작아도 hit area를 확보한다 (cell ~32px, Sheet 44px)
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
        // 여러 줄 계획에서도 첫 줄 옆에 정렬되도록 top 기준 (hit area는 유지)
        "flex shrink-0 items-center justify-center",
        size === "cell" ? "-mt-1 -ml-0.5 h-8 w-7" : "-mt-0.5 h-11 w-11",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-full border-2 transition",
          size === "cell" ? "h-[14px] w-[14px]" : "h-[19px] w-[19px]",
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

// Sheet 내부 등록/수정 폼 — 날짜 + 할 내용만 (전 필드 1열 w-full, 2열 강제 금지).
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
  const [title, setTitle] = useState(initial.title);

  return (
    <div className="space-y-3">
      <label className="block min-w-0">
        <span className="mb-1 block text-sm font-semibold text-[#7c6d69]">날짜</span>
        <input
          type="date"
          value={planDate}
          onChange={(event) => {
            setPlanDate(event.target.value);
            onDirtyChange(true);
          }}
          className="min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
          aria-label="계획 날짜"
        />
      </label>

      <label className="block min-w-0">
        <span className="mb-1 block text-sm font-semibold text-[#7c6d69]">할 내용</span>
        {/* 여러 줄 입력: Enter = 줄바꿈 (form submit 아님 — 저장은 아래 버튼으로만).
            onChange에서 값 재작성 없음 — newline/IME 조합이 그대로 보존된다. */}
        <textarea
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            onDirtyChange(event.target.value !== initial.title || planDate !== initial.planDate);
          }}
          rows={4}
          maxLength={500}
          placeholder={"백발백중 문법 오답 풀이\n이그잼포유 관계대명사\n객관식 문제 숙제"}
          className="min-h-[110px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base leading-6 outline-none focus:border-[#c9b9e8]"
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
          onClick={() => onSubmit({ planDate, title })}
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
          className="min-h-[40px] w-full rounded-xl px-3 text-sm text-[#8f625f] transition hover:bg-[#fff5f2]"
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
  plansFailed = false,
  readOnly = false,
}: {
  examId: string;
  examStart: string;
  examEnd: string;
  examTypeLabel: string;
  today: string; // KST "YYYY-MM-DD" (서버 계산 — client timezone에 의존하지 않는다)
  initialPlans: ExamPrepPlanRecord[];
  // 계획 조회 자체가 실패한 상태 (0개 empty와 구분 — 조용히 위장하지 않는다)
  plansFailed?: boolean;
  // read-only 참고 모드 (Daily Log 상단 미리보기) — 같은 DB row/완료 상태를 보여주되
  // 완료 toggle/추가/수정/삭제 진입을 전부 막는다 (날짜 Sheet는 읽기 전용으로 열림)
  readOnly?: boolean;
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

  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const completedCount = plans.filter((plan) => plan.completed).length;
  const totalCount = plans.length;
  // 목록 카드와 같은 공용 공식 (상세/목록 진행률이 항상 일치)
  const percent = planProgressPercent(completedCount, totalCount);
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
  const sheetPlans = plansByDate.get(sheetDate) ?? [];
  const editingPlan =
    sheetMode?.type === "edit" ? plans.find((p) => p.id === sheetMode.planId) ?? null : null;

  const navButton =
    "flex h-10 min-w-10 items-center justify-center rounded-xl border border-[#ece0db] bg-white px-2 text-sm font-medium text-[#564d4d] transition hover:bg-[#faf6f3]";

  return (
    <section
      className="@container rounded-3xl border border-[#d5e6f3] bg-gradient-to-b from-[#e2f0fa] via-[#edf5fb] to-[#eef6ef] p-3 shadow-sm sm:p-4"
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
          <h2 className="card-title text-[#2b2323]">
            {monthLabel(month)}
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${dday.className}`}
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
              <span className="text-sm tabular-nums text-[#564d4d]">
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
          {!readOnly ? (
            <button
              type="button"
              onClick={() => {
                setSelectedDate((prev) => prev ?? today);
                setSheetMode({ type: "add" });
                setFormError("");
              }}
              className="flex min-h-[40px] items-center gap-1 rounded-xl border border-[#ddd0ec] bg-[#f9f5fd] px-3 text-sm font-medium text-[#6d5aa8] transition hover:bg-[#f3ecfa]"
            >
              <Plus className="h-3.5 w-3.5" /> 계획 추가
            </button>
          ) : null}
        </div>
      </div>

      {toggleError ? (
        <p className="px-1 pb-2 text-sm text-[#a2665f]">{toggleError}</p>
      ) : null}

      {plansFailed ? (
        <div className="mb-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-2.5 text-sm leading-5 text-[#7f5d57]">
          시험 대비 계획을 불러오지 못했어요. 새로고침해도 계속되면 Supabase SQL Editor에서{" "}
          <code>20260907_create_exam_prep_plans.sql</code> 적용 여부를 확인해주세요.
        </div>
      ) : null}

      {/* ── Calendar + (넓으면 우측 Sheet) — 같은 component tree, CSS container query로만 전환 ── */}
      <div className="flex min-w-0 items-start">
        <div className="@container min-w-0 flex-1">
          {/* 스프링 노트 sheet — 코일 장식이 상단에 걸리도록 위 여백 확보 */}
          <div className="relative mt-4 rounded-2xl border border-[#dfe7ef] bg-white px-1.5 pb-2 pt-6 shadow-[0_12px_28px_rgba(120,150,180,0.14)] sm:px-2">
          <SpringCoils />

          {/* 요일 헤더 (일요일 시작 — SUN/SAT 웜 레드) */}
          <div className="grid grid-cols-7 border-b-2 border-[#eef1f5] pb-2">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "px-1 text-center text-xs font-semibold tracking-[0.04em]",
                  index === 0 || index === 6 ? WEEKEND_TEXT : "text-[#4a4a55]",
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
                      className="border-b border-r border-[#eef1f5] bg-[#f8fafc]/70 first:border-l"
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
                      "min-h-[84px] min-w-0 cursor-pointer border-b border-r border-[#eef1f5] px-1 py-1 text-left align-top transition first:border-l @min-[540px]:min-h-[96px] @min-[760px]:min-h-[118px]",
                      inExamPeriod ? "bg-[#fdeeee]/75" : "bg-white hover:bg-[#f7fafd]",
                      isSelected && "ring-1 ring-inset ring-[#a9c8e8]",
                    )}
                  >
                    {/* 날짜 숫자는 참고 디자인처럼 가운데 정렬, 그 아래 시험 badge */}
                    <div className="flex min-w-0 flex-col items-center gap-0.5">
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                          isToday
                            ? "bg-[#8b7ae6] text-white"
                            : dayIndex === 0 || dayIndex === 6
                              ? WEEKEND_TEXT
                              : "text-[#3f3f49]",
                        )}
                      >
                        {dayNum}
                      </span>
                      {date === examStart ? (
                        <span className="hidden max-w-full truncate rounded-full bg-[#fbdcda] px-2 py-0.5 text-xs font-semibold text-[#c05a50] @min-[540px]:block">
                          {examTypeLabel}
                        </span>
                      ) : inExamPeriod ? (
                        <span aria-hidden className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0b0ab] @min-[540px]:block" />
                      ) : null}
                    </div>

                    {dayPlans.length > 0 ? (
                      // 폰트는 wrapper에 지정 — globals의 button { font: inherit } 덕에 버튼이 상속받는다
                      // (button에 직접 준 text-* 유틸리티는 unlayered 규칙에 밀려 적용되지 않음).
                      // 계획은 truncate/line-clamp/+N 없이 전부 표시 — 내용이 많으면 셀(주 row)이
                      // 자연스럽게 늘어난다 (min-h만 있고 max-h/내부 scroll 없음).
                      <div className="mt-px space-y-0.5 text-sm leading-tight">
                        {/* 아주 좁은 컨테이너(모바일)만 본문 대신 개수 marker —
                            날짜를 탭하면 Sheet에서 전체 multiline 본문을 확인한다 */}
                        <span className="mx-auto inline-flex rounded-full bg-[#d9efe3] px-2 py-0.5 font-medium text-[#3d7f64] @min-[540px]:hidden">
                          계획 {dayPlans.length}
                        </span>
                        {dayPlans.map((plan) => (
                          <div key={plan.id} className="hidden min-w-0 items-start @min-[540px]:flex">
                            <CheckCircle
                              completed={plan.completed}
                              title={plan.title}
                              disabled={readOnly}
                              onToggle={() => toggleCompleted(plan)}
                              size="cell"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                if (readOnly) {
                                  // 읽기 모드: 수정 대신 셀 클릭(openList)으로 전파 — 내용 확인만
                                  return;
                                }
                                // title 탭 = 수정 Sheet (완료 toggle과 별개 action)
                                event.stopPropagation();
                                setSelectedDate(date);
                                setSheetMode({ type: "edit", planId: plan.id });
                                setFormError("");
                              }}
                              className={cn(
                                // 입력한 줄바꿈 그대로 + 자연스러운 wrapping (break-words —
                                // 한글 문장은 자연 개행, 아주 긴 영어/URL만 강제 개행)
                                "block min-w-0 flex-1 whitespace-pre-wrap break-words py-px text-left",
                                plan.completed
                                  ? "text-[#9a8f8a] line-through decoration-[#c9beb8]"
                                  : "text-[#453b3b]",
                              )}
                            >
                              {plan.title}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          </div>

          {/* 프레임 하단 꽃 장식 (참고 디자인의 잔디+꽃 느낌 — decoration only) */}
          <div aria-hidden className="pointer-events-none mt-1.5 flex justify-between px-1 text-sm opacity-80">
            <span>🌼</span>
            <span>🌿</span>
            <span>🌼</span>
          </div>
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
                  <div className="card-title text-[#2b2323]">
                    {formatKoreanDate(sheetDate, true)}
                  </div>
                  <div className="mt-0.5 text-sm text-[#8a7b77]">
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
                    {sheetPlans.length === 0 ? (
                      <p className="rounded-xl bg-[#f8f3ef] p-3 text-sm text-[#655d5d]">
                        {readOnly
                          ? "이 날짜에는 등록된 시험 대비 계획이 없어요."
                          : "이 날짜에는 아직 계획이 없어요. 시험 대비 계획을 등록해보세요."}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {sheetPlans.map((plan) => (
                          <div key={plan.id} className="flex min-w-0 items-start gap-1">
                            <CheckCircle
                              completed={plan.completed}
                              title={plan.title}
                              disabled={readOnly}
                              onToggle={() => toggleCompleted(plan)}
                              size="sheet"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (readOnly) {
                                  return; // 읽기 모드: 수정 Sheet 진입 없음
                                }
                                setSheetMode({ type: "edit", planId: plan.id });
                                setFormError("");
                              }}
                              className="min-w-0 flex-1 rounded-lg px-1 py-2 text-left transition hover:bg-[#faf6f3]"
                            >
                              {/* Sheet에서도 multiline 전체 표시 — ellipsis/clamp 없음 */}
                              <span
                                className={cn(
                                  "block whitespace-pre-wrap break-words text-sm leading-5",
                                  plan.completed
                                    ? "text-[#9a8f8a] line-through decoration-[#c9beb8]"
                                    : "text-[#2d2928]",
                                )}
                              >
                                {plan.title}
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {formError ? <p className="text-sm text-[#a2665f]">{formError}</p> : null}

                    {!readOnly ? (
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
                    ) : null}
                  </div>
                ) : sheetMode.type === "add" ? (
                  <PlanForm
                    key={`add-${sheetDate}`}
                    initial={{ planDate: sheetDate, title: "" }}
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
                      title: editingPlan.title,
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
