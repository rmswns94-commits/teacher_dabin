"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ArrowLeft, ChevronRight, History, Pencil, SquareArrowOutUpRight, X } from "lucide-react";

import {
  loadGroupHistoryAction,
  loadHistoryRecordsAction,
  updateHistoryLogAction,
} from "@/app/daily-logs/actions";
import { DailyLogStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import {
  effortLevelLabels,
  focusLevelLabels,
  homeworkStatusLabels,
  kindnessLevelLabels,
  participationLevelLabels,
  questionLevelLabels,
} from "@/lib/elementary";
import { mergeLegacyLessonContent } from "@/lib/progress";
import { formatTimeRange } from "@/lib/schedule";
import type {
  DailyLogHistorySummary,
  DailyLogPraiseRow,
  StudentLessonLogWithStudent,
} from "@/lib/supabase/queries/daily-logs";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Import context: 패널 → 현재 작성 폼으로 값 전달 (자동 복사 금지).     */
/* 폼이 handler를 register하고, 패널 버튼 클릭 시에만 handler가 호출된다 */
/* — setState가 전부 이벤트 핸들러 안에서 일어나는 구독 패턴.            */
/* ------------------------------------------------------------------ */

const HistoryImportContext = createContext<{
  register: (handler: (text: string) => void) => () => void;
  requestImport: (text: string) => void;
}>({ register: () => () => {}, requestImport: () => {} });

export function useHistoryImport() {
  return useContext(HistoryImportContext);
}

/* ------------------------------------------------------------------ */

type ScheduleSlot = { day_of_week: number; start_time: string; end_time: string };

type PanelMode = "list" | "detail" | "edit";

type EditValues = {
  title: string;
  defaultProgress: string;
  homework: string;
  nextLessonPlan: string;
  memo: string;
};

type RecordsData = { records: StudentLessonLogWithStudent[]; praises: DailyLogPraiseRow[] };

const attendanceLabels: Record<string, string> = {
  present: "출석",
  late: "지각",
  absent: "결석",
};

function Section({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) {
    return null;
  }

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8f5470]">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-line text-sm leading-6 text-[#3d3450]">{value}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#7c6d69]">{label}</span>
      {rows ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          className="w-full rounded-2xl border border-[#e2d8f3] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#c9b9e8]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-[#e2d8f3] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9b9e8]"
        />
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace: 좌측(현재 작성 폼 children) + 우측 이전 수업 기록 패널.     */
/* 패널은 단일 인스턴스 — xl 이상은 persistent 컬럼, 미만은 우측 Drawer  */
/* (CSS로만 전환하므로 회전/리사이즈에도 선택·작성 state가 유지된다)     */
/* ------------------------------------------------------------------ */

export function LessonHistoryWorkspace({
  group,
  currentDate,
  initialRows,
  initialHasMore,
  initialLoadFailed = false,
  schedules,
  children,
}: {
  group: { id: string; name: string } | null;
  currentDate: string;
  initialRows: DailyLogHistorySummary[];
  initialHasMore: boolean;
  initialLoadFailed?: boolean;
  schedules: ScheduleSlot[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // history state는 반응형 wrapper보다 위(여기)에서 관리 — presentation만 바뀐다
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [listError, setListError] = useState(
    initialLoadFailed ? "이전 수업 기록을 불러오지 못했어요." : "",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>("list");
  const [recordsCache, setRecordsCache] = useState<Record<string, RecordsData>>({});
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [editValues, setEditValues] = useState<EditValues | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<EditValues | null>(null);
  const [editError, setEditError] = useState("");
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [isPending, startTransition] = useTransition();

  // 현재 작성 폼이 등록한 import handler (폼이 없으면 no-op)
  const importHandlerRef = useRef<((text: string) => void) | null>(null);

  const register = useCallback((handler: (text: string) => void) => {
    importHandlerRef.current = handler;
    return () => {
      if (importHandlerRef.current === handler) {
        importHandlerRef.current = null;
      }
    };
  }, []);

  const requestImport = useCallback((text: string) => {
    importHandlerRef.current?.(text);
    // 좁은 화면에서는 drawer가 폼을 덮고 있으므로 닫아서 반영된 값을 보여준다
    setOpen(false);
  }, []);

  const importContext = useMemo(() => ({ register, requestImport }), [register, requestImport]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const editDirty =
    mode === "edit" &&
    editValues !== null &&
    editSnapshot !== null &&
    JSON.stringify(editValues) !== JSON.stringify(editSnapshot);

  useBeforeUnloadWarning(editDirty);

  // 수정 중 dirty면 어떤 이동이든 기존 unsaved 확인을 거친다 (현재 폼 guard와 별개)
  const withEditGuard = (action: () => void) => {
    if (editDirty) {
      setPendingDiscard(() => action);
      return;
    }
    action();
  };

  const timeOf = (date: string) => {
    const times = schedules
      .filter((slot) => slot.day_of_week === dayOfWeekOf(date))
      .map((slot) => formatTimeRange(slot.start_time, slot.end_time));
    return times.length === 1 ? times[0] : null;
  };

  const openDetail = (id: string) =>
    withEditGuard(() => {
      setSelectedId(id);
      setMode("detail");
      setRecordsOpen(false);
      setRecordsError("");
      setEditError("");
    });

  const backToList = () =>
    withEditGuard(() => {
      setMode("list");
      setSelectedId(null);
      setRecordsOpen(false);
    });

  const closeDrawer = () => withEditGuard(() => setOpen(false));

  const startEdit = () => {
    if (!selected) return;
    const values: EditValues = {
      title: selected.title ?? "",
      // 수정 초기값도 legacy 수업 내용을 병합한 canonical 진도 기준 (기존 수정 화면과 동일)
      defaultProgress: mergeLegacyLessonContent(selected.default_progress, selected.lesson_content),
      homework: selected.homework ?? "",
      nextLessonPlan: selected.next_lesson_plan ?? "",
      memo: selected.memo ?? "",
    };
    setEditValues(values);
    setEditSnapshot(values);
    setEditError("");
    setMode("edit");
  };

  const loadMore = () => {
    if (!group) return;
    setListError("");
    startTransition(async () => {
      const result = await loadGroupHistoryAction({
        groupId: group.id,
        before: currentDate,
        offset: rows.length,
      });
      if ("error" in result) {
        setListError(result.error ?? "이전 수업 기록을 불러오지 못했어요.");
        return;
      }
      setRows((prev) => [...prev, ...result.rows.filter((row) => !prev.some((p) => p.id === row.id))]);
      setHasMore(result.hasMore);
    });
  };

  const loadRecords = () => {
    if (!selected) return;
    setRecordsOpen(true);
    if (recordsCache[selected.id]) return;
    setRecordsError("");
    startTransition(async () => {
      const result = await loadHistoryRecordsAction(selected.id);
      if ("error" in result) {
        setRecordsError(result.error ?? "학생 기록을 불러오지 못했어요.");
        return;
      }
      setRecordsCache((prev) => ({
        ...prev,
        [selected.id]: { records: result.records, praises: result.praises },
      }));
    });
  };

  const saveEdit = () => {
    if (!selected || !editValues) return;
    setEditError("");
    startTransition(async () => {
      const result = await updateHistoryLogAction({
        dailyLogId: selected.id,
        title: editValues.title,
        defaultProgress: editValues.defaultProgress,
        homework: editValues.homework,
        nextLessonPlan: editValues.nextLessonPlan,
        memo: editValues.memo,
      });
      if ("error" in result) {
        // 실패 시 edit form과 입력값 유지 (현재 작성 폼도 영향 없음)
        setEditError(result.error ?? "이전 수업 기록을 저장하지 못했어요. 다시 시도해주세요.");
        return;
      }
      // 해당 이전 일지 한 건만 갱신 — 목록 preview 최신화 후 read-only 상세로 복귀
      setRows((prev) =>
        prev.map((row) => (row.id === selected.id ? { ...row, ...result.row } : row)),
      );
      setEditValues(null);
      setEditSnapshot(null);
      setMode("detail");
    });
  };

  const panelBody = (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-dashed border-[#eee3dc] pb-3">
        <div>
          <div className="flex items-center gap-1.5 font-display text-base font-semibold text-[#2a2323]">
            <History className="h-4 w-4 text-[#8b7ae6]" aria-hidden /> 이전 수업 기록
          </div>
          <div className="mt-0.5 text-xs text-[#8a7b77]">
            {group ? group.name : "수업 그룹 미선택"}
          </div>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="이전 수업 기록 닫기"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[#8a7b77] transition hover:bg-[#faf0f2] xl:hidden"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {!group ? (
          <p className="rounded-2xl bg-[#faf4ef] px-3 py-3 text-sm text-[#8a7b77]">
            수업 그룹을 먼저 선택해주세요.
          </p>
        ) : mode === "list" ? (
          <>
            {listError ? (
              <p className="mb-2 rounded-2xl bg-[#fdf1f0] px-3 py-2.5 text-xs text-[#a05252]">
                {listError}
              </p>
            ) : null}
            {rows.length === 0 && !listError ? (
              <p className="rounded-2xl bg-[#faf4ef] px-3 py-3 text-sm text-[#8a7b77]">
                아직 이전 수업 기록이 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => {
                  const progress = mergeLegacyLessonContent(row.default_progress, row.lesson_content);
                  const time = timeOf(row.class_date);

                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => openDetail(row.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition",
                          row.id === selectedId
                            ? "border-[#d9c9ef] bg-[#f5f1fb]"
                            : "border-[#f0e6e0] bg-white hover:border-[#e3d5ef] hover:bg-[#fdfaff]",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-[#2d2928]">
                              {formatKoreanDate(row.class_date)}
                            </span>
                            {time ? (
                              <span className="text-[11px] tabular-nums text-[#8a7b77]">{time}</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-xs leading-5 text-[#655d5d]">
                            {progress || "기록된 진도가 없어요."}
                          </span>
                        </span>
                        <DailyLogStatusBadge status={row.status} />
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c9b6bd]" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {hasMore ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                disabled={isPending}
                onClick={loadMore}
              >
                {isPending ? "불러오는 중..." : "이전 기록 더 보기"}
              </Button>
            ) : null}
          </>
        ) : selected ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={mode === "edit" ? () => withEditGuard(() => setMode("detail")) : backToList}
              className="flex items-center gap-1.5 text-xs font-medium text-[#8a7b77] transition hover:text-[#564d4d]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {mode === "edit" ? "기록 보기로 돌아가기" : "이전 수업 기록"}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-[#2d2928]">
                {formatKoreanDate(selected.class_date, true)}
              </span>
              {timeOf(selected.class_date) ? (
                <span className="text-xs tabular-nums text-[#8a7b77]">
                  {timeOf(selected.class_date)}
                </span>
              ) : null}
              <DailyLogStatusBadge status={selected.status} />
            </div>

            {mode === "detail" ? (
              <>
                <div className="space-y-3 rounded-2xl border border-[#f0e6e0] bg-white px-3.5 py-3">
                  <Section label="수업 제목" value={selected.title} />
                  <Section
                    label="공통 진도"
                    value={
                      mergeLegacyLessonContent(selected.default_progress, selected.lesson_content) ||
                      "기록된 진도가 없어요."
                    }
                  />
                  <Section label="오늘 숙제" value={selected.homework} />
                  <Section label="다음 수업 계획" value={selected.next_lesson_plan} />
                  <Section label="수업 메모" value={selected.memo} />
                </div>

                {/* 학생 기록: 펼칠 때만 batch 조회 (lazy) */}
                <div className="rounded-2xl border border-[#f0e6e0] bg-white px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#4d3a3a]">
                      학생 기록 {selected.studentCount}명
                    </span>
                    {!recordsOpen ? (
                      <Button type="button" variant="ghost" size="sm" onClick={loadRecords}>
                        펼쳐보기
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRecordsOpen(false)}
                      >
                        접기
                      </Button>
                    )}
                  </div>
                  {recordsOpen ? (
                    recordsError ? (
                      <p className="mt-2 text-xs text-[#a05252]">{recordsError}</p>
                    ) : !recordsCache[selected.id] ? (
                      <p className="mt-2 text-xs text-[#8a7b77]">불러오는 중...</p>
                    ) : (
                      <ul className="mt-2 space-y-2.5">
                        {recordsCache[selected.id].records.map((record) => {
                          const chips = [
                            record.homework_status
                              ? `숙제 ${homeworkStatusLabels[record.homework_status]}`
                              : null,
                            record.vocab_correct !== null ? `단어 ${record.vocab_correct}` : null,
                            record.vocab_retest ? "재시험" : null,
                            record.focus_level
                              ? `집중 ${focusLevelLabels[record.focus_level]}`
                              : null,
                            record.participation_level
                              ? `참여 ${participationLevelLabels[record.participation_level]}`
                              : null,
                            record.question_level
                              ? `질문 ${questionLevelLabels[record.question_level]}`
                              : null,
                            record.kindness_level
                              ? `배려 ${kindnessLevelLabels[record.kindness_level]}`
                              : null,
                            record.effort_level
                              ? `노력 ${effortLevelLabels[record.effort_level]}`
                              : null,
                          ].filter((chip): chip is string => Boolean(chip));
                          const praises = recordsCache[selected.id].praises.filter(
                            (praise) => praise.student_id === record.student_id && praise.comment,
                          );

                          return (
                            <li
                              key={record.id}
                              className="rounded-xl bg-[#fbf8f4] px-3 py-2 text-xs leading-5"
                            >
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-[#2d2928]">
                                  {record.student?.name ?? "학생"}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                    record.attendance === "absent"
                                      ? "bg-[#fdeceb] text-[#a05252]"
                                      : record.attendance === "late"
                                        ? "bg-[#fdf3e4] text-[#94702f]"
                                        : "bg-[#e4f4ec] text-[#3d7f64]",
                                  )}
                                >
                                  {attendanceLabels[record.attendance] ?? record.attendance}
                                </span>
                              </span>
                              {chips.length > 0 ? (
                                <span className="mt-1 block text-[#655d5d]">{chips.join(" · ")}</span>
                              ) : null}
                              {record.strengths ? (
                                <span className="mt-0.5 block text-[#655d5d]">{record.strengths}</span>
                              ) : null}
                              {praises.length > 0 ? (
                                <span className="mt-1 block space-y-0.5">
                                  {praises.map((praise, praiseIndex) => (
                                    <span key={praiseIndex} className="block text-[#6d5aa8]">
                                      💜 {praise.comment}
                                    </span>
                                  ))}
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : null}
                </div>

                {/* 현재 일지에 참고하기 — DB 저장 없이 현재 작성 폼에만 값 반영 */}
                <div className="rounded-2xl border border-[#e8ddf3] bg-[#fbf8ff] px-3.5 py-3">
                  <div className="text-sm font-medium text-[#4d3a3a]">현재 일지에 참고하기</div>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#8a7b77]">
                    선택한 값이 현재 작성 중인 공통 진도에 들어가요. 저장 전까지 DB에는 반영되지
                    않아요.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!selected.next_lesson_plan?.trim()}
                      onClick={() => requestImport(selected.next_lesson_plan?.trim() ?? "")}
                    >
                      다음 수업 계획 → 현재 공통 진도
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={
                        !mergeLegacyLessonContent(
                          selected.default_progress,
                          selected.lesson_content,
                        )
                      }
                      onClick={() =>
                        requestImport(
                          mergeLegacyLessonContent(
                            selected.default_progress,
                            selected.lesson_content,
                          ),
                        )
                      }
                    >
                      공통 진도 → 현재 공통 진도
                    </Button>
                  </div>
                </div>

                <Button type="button" size="sm" className="w-full gap-1.5" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" /> 이 기록 수정하기
                </Button>
              </>
            ) : editValues ? (
              <div className="space-y-3">
                <EditField
                  label="수업 제목"
                  value={editValues.title}
                  onChange={(value) => setEditValues((prev) => prev && { ...prev, title: value })}
                />
                <EditField
                  label="공통 진도"
                  rows={5}
                  value={editValues.defaultProgress}
                  onChange={(value) =>
                    setEditValues((prev) => prev && { ...prev, defaultProgress: value })
                  }
                />
                <EditField
                  label="오늘 숙제"
                  rows={2}
                  value={editValues.homework}
                  onChange={(value) => setEditValues((prev) => prev && { ...prev, homework: value })}
                />
                <EditField
                  label="다음 수업 계획"
                  rows={2}
                  value={editValues.nextLessonPlan}
                  onChange={(value) =>
                    setEditValues((prev) => prev && { ...prev, nextLessonPlan: value })
                  }
                />
                <EditField
                  label="수업 메모"
                  rows={2}
                  value={editValues.memo}
                  onChange={(value) => setEditValues((prev) => prev && { ...prev, memo: value })}
                />

                {editError ? (
                  <p className="rounded-2xl bg-[#fdf1f0] px-3 py-2.5 text-xs text-[#a05252]">
                    {editError}
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={isPending || !editDirty}
                    onClick={saveEdit}
                  >
                    {isPending ? "저장 중..." : "변경사항 저장"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => withEditGuard(() => setMode("detail"))}
                  >
                    취소
                  </Button>
                </div>

                <p className="text-[11px] leading-4 text-[#8a7b77]">
                  출결·학생 평가·칭찬 수정은{" "}
                  <Link
                    href={`/daily-logs/${selected.id}/edit`}
                    target="_blank"
                    className="inline-flex items-center gap-0.5 font-medium text-[#6d5aa8] underline underline-offset-2"
                  >
                    전체 수정 화면 <SquareArrowOutUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                  에서 할 수 있어요. 새 탭으로 열려 현재 작성 내용은 그대로 유지돼요.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <HistoryImportContext.Provider value={importContext}>
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-6">
        <div className="min-w-0">
          <div className="mb-3 flex justify-end xl:hidden">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              aria-label="이전 수업 기록 열기"
              onClick={() => setOpen(true)}
            >
              <History className="h-3.5 w-3.5" /> 이전 수업 기록
            </Button>
          </div>
          {children}
        </div>

        {/* xl 미만 drawer backdrop */}
        {open ? (
          <div
            aria-hidden
            className="fixed inset-0 z-[55] bg-[#2b2323]/25 xl:hidden"
            onClick={closeDrawer}
          />
        ) : null}

        {/* 단일 패널 인스턴스: xl 이상 persistent / 미만 우측 drawer (state 공유) */}
        <aside
          aria-label="이전 수업 기록"
          className={cn(
            "xl:sticky xl:top-6 xl:block xl:max-h-[calc(100vh-3rem)] xl:overflow-hidden xl:rounded-3xl xl:border xl:border-[#efe4dc] xl:bg-[#fffdfb] xl:p-4 xl:shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
            open
              ? "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-[60] max-xl:w-[min(430px,94vw)] max-xl:overflow-hidden max-xl:border-l max-xl:border-[#efe4dc] max-xl:bg-[#fffdfb] max-xl:p-4 max-xl:pb-[max(1rem,env(safe-area-inset-bottom))] max-xl:shadow-[-16px_0_44px_rgba(60,48,90,0.2)] md:max-xl:w-[min(560px,52vw)]"
              : "max-xl:hidden",
          )}
        >
          {panelBody}
        </aside>
      </div>

      <ConfirmDiscardDialog
        open={pendingDiscard !== null}
        onKeepEditing={() => setPendingDiscard(null)}
        onDiscard={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          setEditValues(null);
          setEditSnapshot(null);
          setMode("detail");
          action?.();
        }}
      />
    </HistoryImportContext.Provider>
  );
}
