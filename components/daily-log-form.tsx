"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CircleArrowRight,
  CircleCheck,
  CircleX,
  Cloud,
  Clock3,
  NotebookPen,
  NotebookTabs,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MakeupStatusBadge } from "@/components/status-badge";
import { useHistoryImport } from "@/components/lesson-history-panel";
import { registerDirtyCheck } from "@/components/unsaved-guard";
import {
  autosaveDailyLogDraftAction,
  discardDailyLogDraftAction,
  saveDailyLogAction,
} from "@/app/daily-logs/actions";
import { improvementPresets, strengthPresets } from "@/lib/constants/lesson-comments";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import { nextClassDateAfter } from "@/lib/schedule";
import { currentEpochMs } from "@/lib/todo-window";
import {
  effortLevelLabels,
  effortLevelValues,
  focusLevelLabels,
  focusLevelValues,
  homeworkStatusLabels,
  homeworkStatusValues,
  kindnessLevelLabels,
  kindnessLevelValues,
  participationLevelLabels,
  participationLevelValues,
  questionLevelLabels,
  questionLevelValues,
  vocabPercent,
} from "@/lib/elementary";
import { gradeDisplay } from "@/lib/grades";
import type { AttendanceStatus, StudentGrade } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export type DailyLogFormStudent = {
  studentId: string;
  name: string;
  grade: StudentGrade;
  entry?: {
    attendance: AttendanceStatus;
    progress: string;
    strengths: string;
    improvements: string;
    memo: string;
    homeworkStatus?: string;
    vocabCorrect?: string;
    vocabRetest?: boolean;
    focusLevel?: string;
    participationLevel?: string;
    questionLevel?: string;
    kindnessLevel?: string;
    effortLevel?: string;
    parentNote?: string;
  };
  praiseComments?: string[];
  makeup?: {
    status: "required" | "scheduled" | "completed" | "cancelled";
    scheduledDate: string;
    missedProgress: string;
  } | null;
};

type EntryState = {
  attendance: AttendanceStatus;
  progress: string;
  strengths: string;
  improvements: string;
  memo: string;
  missedProgress: string;
  needsMakeup: boolean;
  makeupScheduledDate: string;
  makeupCompleted: boolean;
  homeworkStatus: string;
  vocabCorrect: string;
  vocabRetest: boolean;
  focusLevel: string;
  participationLevel: string;
  questionLevel: string;
  kindnessLevel: string;
  effortLevel: string;
  parentNoteNeeded: boolean;
  parentNote: string;
  praiseComments: string[];
};

function initEntry(student: DailyLogFormStudent): EntryState {
  const makeup = student.makeup ?? null;
  const makeupOpen = makeup?.status === "required" || makeup?.status === "scheduled";

  return {
    attendance: student.entry?.attendance ?? "present",
    progress: student.entry?.progress ?? "",
    strengths: student.entry?.strengths ?? "",
    improvements: student.entry?.improvements ?? "",
    memo: student.entry?.memo ?? "",
    missedProgress: makeup?.missedProgress ?? "",
    needsMakeup: makeupOpen || makeup?.status === "completed",
    makeupScheduledDate: makeupOpen ? makeup?.scheduledDate ?? "" : "",
    makeupCompleted: makeup?.status === "completed",
    homeworkStatus: student.entry?.homeworkStatus ?? "",
    vocabCorrect: student.entry?.vocabCorrect ?? "",
    vocabRetest: student.entry?.vocabRetest ?? false,
    focusLevel: student.entry?.focusLevel ?? "",
    participationLevel: student.entry?.participationLevel ?? "",
    questionLevel: student.entry?.questionLevel ?? "",
    kindnessLevel: student.entry?.kindnessLevel ?? "",
    effortLevel: student.entry?.effortLevel ?? "",
    parentNoteNeeded: Boolean(student.entry?.parentNote),
    parentNote: student.entry?.parentNote ?? "",
    praiseComments: student.praiseComments ?? [],
  };
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 3);

// 숫자 전용 필드의 IME-safe onChange: 한글 조합(composition) 도중 값을 재작성하면
// iPad Safari에서 자모가 씹힐 수 있어, 조합 중에는 raw를 유지하고
// 조합이 끝나는 시점(onCompositionEnd)과 일반 입력에서만 정리한다.
function isComposingEvent(event: { nativeEvent: object }) {
  return Boolean((event.nativeEvent as { isComposing?: boolean }).isComposing);
}

// 자동 임시저장 주기 (final 저장과 별개 — background 보호용)
const DAILY_LOG_AUTOSAVE_INTERVAL_MS = 60_000;

// iPad Safari/PWA가 문서를 강제 reload(process eviction)한 직후의 복구용:
// 이 시간 안에 저장된 draft는 같은 작성 세션으로 보고 자동 복원한다.
// 더 오래된 draft는 자동 반영하지 않고 복구 배너로 선택하게 한다.
const AUTO_RESTORE_WINDOW_MS = 10 * 60_000;

type DraftPayload = {
  classDate: string;
  title: string;
  defaultProgress: string;
  memo: string;
  homework: string;
  nextLessonPlan: string;
  nextPlanDate: string;
  vocabTotal: string;
  entries: Record<string, EntryState>;
};

function restoredText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function kstTimeLabel(iso: string) {
  const kst = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

// 초등 quick check용 세그먼트 (같은 값을 다시 누르면 해제 — 미입력과 구분)
function SegmentedToggle({
  label,
  value,
  options,
  onChange,
  activeClass,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (next: string) => void;
  activeClass: string;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="w-8 shrink-0 text-xs font-semibold text-[#7c6d69]">{label}</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(value === option.value ? "" : option.value)}
            className={cn(
              "min-h-[38px] rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
              value === option.value
                ? activeClass
                : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DailyLogForm({
  dailyLogId,
  classDate: initialClassDate,
  group,
  students,
  scheduleDays = [],
  draft = null,
  initial,
}: {
  dailyLogId?: string;
  classDate: string;
  group: { id: string; name: string; grade?: string };
  students: DailyLogFormStudent[];
  // 그룹 시간표 요일 (다음 수업 계획 기본 날짜 계산용 — 없으면 날짜 직접 선택)
  scheduleDays?: number[];
  // 서버에서 발견한 자동 임시저장 draft (있으면 복구 배너 표시 — 자동 덮어쓰기 없음)
  draft?: { id: string; updatedAt: string; payload: unknown } | null;
  initial?: {
    title: string;
    defaultProgress: string;
    memo: string;
    homework: string;
    nextLessonPlan: string;
    nextPlanDate?: string;
    vocabTotal?: string;
  };
}) {
  // 최근(10분 내) 임시저장 draft는 mount 시점에 자동 복원 — reload 복구가 목적이라
  // effect/remount 없이 초기 state로만 반영한다 (IME/입력에 영향 없음).
  const [autoRestored] = useState(() =>
    Boolean(draft && currentEpochMs() - Date.parse(draft.updatedAt) < AUTO_RESTORE_WINDOW_MS),
  );
  const [restored] = useState<Partial<DraftPayload> | null>(() =>
    autoRestored && draft && draft.payload && typeof draft.payload === "object"
      ? (draft.payload as Partial<DraftPayload>)
      : null,
  );

  const [classDate, setClassDate] = useState(
    restoredText(restored?.classDate, "") || initialClassDate,
  );
  const [title, setTitle] = useState(restoredText(restored?.title, initial?.title ?? ""));
  const [defaultProgress, setDefaultProgress] = useState(
    restoredText(restored?.defaultProgress, initial?.defaultProgress ?? ""),
  );
  const [memo, setMemo] = useState(restoredText(restored?.memo, initial?.memo ?? ""));
  const [homework, setHomework] = useState(
    restoredText(restored?.homework, initial?.homework ?? ""),
  );
  const [nextLessonPlan, setNextLessonPlan] = useState(
    restoredText(restored?.nextLessonPlan, initial?.nextLessonPlan ?? ""),
  );
  // 다음 수업 계획 날짜: 복원값 > 저장값 > 수업일 이후 그룹의 실제 다음 수업일.
  // Teacher가 직접 고르면(touched) 날짜 변경 등 rerender에도 자동 재계산하지 않는다.
  const [nextPlanDate, setNextPlanDate] = useState(
    () =>
      restoredText(restored?.nextPlanDate, "") ||
      initial?.nextPlanDate ||
      nextClassDateAfter(scheduleDays, initialClassDate) ||
      "",
  );
  const [planDateTouched, setPlanDateTouched] = useState(
    Boolean(restoredText(restored?.nextPlanDate, "") || initial?.nextPlanDate),
  );
  // 학생 평가 UI는 초등/중등/고등 모든 학년 공통으로 사용한다.
  const [vocabTotal, setVocabTotal] = useState(
    restoredText(restored?.vocabTotal, initial?.vocabTotal ?? ""),
  );
  const [showSummary, setShowSummary] = useState(false);
  const [entries, setEntries] = useState<Record<string, EntryState>>(() => {
    const base = Object.fromEntries(
      students.map((student) => [student.studentId, initEntry(student)]),
    );
    if (restored?.entries && typeof restored.entries === "object") {
      for (const studentId of Object.keys(base)) {
        const saved = restored.entries[studentId];
        if (saved) {
          base[studentId] = { ...base[studentId], ...saved };
        }
      }
    }
    return base;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      students.map((student) => [
        student.studentId,
        Boolean(student.entry?.strengths || student.entry?.improvements || student.entry?.memo),
      ]),
    ),
  );
  const [error, setError] = useState("");
  // 같은 날짜+같은 반 일지가 이미 있을 때 전용 경고 dialog (form 내용은 보존)
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  // 이전 수업 기록 패널의 [현재 일지에 참고하기] — provider가 없으면 no-op.
  // 패널 버튼 클릭(이벤트 핸들러)에서만 handler가 호출된다: 값이 비어 있으면
  // 바로 반영, 이미 작성한 내용이 있으면 덮어쓰기 확인을 거친다.
  const historyImport = useHistoryImport();
  const [importConfirmText, setImportConfirmText] = useState<string | null>(null);

  useEffect(() => {
    return historyImport.register((text) => {
      if (!defaultProgress.trim() || defaultProgress === text) {
        setDefaultProgress(text);
      } else {
        setImportConfirmText(text);
      }
    });
  }, [historyImport, defaultProgress]);
  const [isPending, startTransition] = useTransition();

  // 뒤로가기 버튼의 unsaved 확인용 dirty 판정 — 스냅샷 비교는 뒤로가기 클릭 시점에만
  // 수행한다 (매 keystroke마다 큰 객체를 직렬화하면 iPad에서 입력 렌더가 느려져
  // 한글 조합이 씹힐 수 있다). state는 ref에 담아 lazy로 읽는다.
  const formStateRef = useRef<Record<string, unknown>>({});
  const initialSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    formStateRef.current = {
      classDate,
      title,
      defaultProgress,
      memo,
      homework,
      nextLessonPlan,
      nextPlanDate,
      vocabTotal,
      entries,
    };
    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = JSON.stringify(formStateRef.current);
    }
  }, [classDate, title, defaultProgress, memo, homework, nextLessonPlan, nextPlanDate, vocabTotal, entries]);
  useEffect(
    () =>
      registerDirtyCheck(
        () => JSON.stringify(formStateRef.current) !== initialSnapshotRef.current,
      ),
    [],
  );

  // ── 자동 임시저장 (1분) ────────────────────────────────────────────
  // 조건: 변경 존재 + 이전 요청 미진행 + IME 조합 중 아님 + final 저장 중 아님.
  // 성공해도 router.refresh/revalidate/side effect 없음 — draft snapshot만 갱신.
  const [autosave, setAutosave] = useState<{
    status: "idle" | "saving" | "saved" | "error";
    savedAtLabel?: string;
  }>(() =>
    autoRestored && draft
      ? { status: "saved", savedAtLabel: kstTimeLabel(draft.updatedAt) }
      : { status: "idle" },
  );
  const [draftPrompt, setDraftPrompt] = useState(Boolean(draft) && !autoRestored);
  const draftIdRef = useRef<string | null>(draft?.id ?? null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const autosaveInFlightRef = useRef(false);
  const composingRef = useRef(false);
  const finalSavingRef = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (autosaveInFlightRef.current || composingRef.current || finalSavingRef.current) {
        return;
      }
      const state = formStateRef.current as { classDate?: unknown };
      const classDateNow = typeof state.classDate === "string" ? state.classDate : "";
      if (!classDateNow) {
        return;
      }
      const snapshot = JSON.stringify(formStateRef.current);
      if (snapshot === lastSavedSnapshotRef.current) {
        return; // 마지막 임시저장 이후 변경 없음 → DB write 금지
      }
      if (lastSavedSnapshotRef.current === null && snapshot === initialSnapshotRef.current) {
        return; // 아무것도 바꾸지 않은 초기 상태
      }
      autosaveInFlightRef.current = true; // in-flight guard (요청 직렬화)
      setAutosave({ status: "saving" });
      const result = await autosaveDailyLogDraftAction({
        draftId: draftIdRef.current,
        dailyLogId: dailyLogId ?? null,
        groupId: group.id,
        classDate: classDateNow,
        payload: formStateRef.current,
      });
      autosaveInFlightRef.current = false;
      if ("error" in result) {
        setAutosave({ status: "error" });
        return; // 입력값은 그대로 — 다음 interval에서 재시도
      }
      draftIdRef.current = result.draftId;
      lastSavedSnapshotRef.current = snapshot;
      setDraftPrompt(false); // 새 임시저장이 생겼으니 예전 복구 배너는 내린다
      setAutosave({ status: "saved", savedAtLabel: kstTimeLabel(result.updatedAt) });
    };

    const interval = setInterval(tick, DAILY_LOG_AUTOSAVE_INTERVAL_MS);
    // 앱이 background로 갈 때 dirty면 한 번 더 저장 시도 (보조)
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHidden);
    };
    // group/dailyLogId는 이 폼 인스턴스에서 불변 (key remount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 임시저장 복구/버리기 (자동 덮어쓰기 없음 — Teacher가 선택)
  const restoreDraft = () => {
    if (!draft) {
      return;
    }
    const data = (draft.payload ?? {}) as Partial<{
      classDate: string;
      title: string;
      defaultProgress: string;
      memo: string;
      homework: string;
      nextLessonPlan: string;
      nextPlanDate: string;
      vocabTotal: string;
      entries: Record<string, EntryState>;
    }>;
    if (typeof data.classDate === "string" && data.classDate) setClassDate(data.classDate);
    if (typeof data.title === "string") setTitle(data.title);
    if (typeof data.defaultProgress === "string") setDefaultProgress(data.defaultProgress);
    if (typeof data.memo === "string") setMemo(data.memo);
    if (typeof data.homework === "string") setHomework(data.homework);
    if (typeof data.nextLessonPlan === "string") setNextLessonPlan(data.nextLessonPlan);
    if (typeof data.nextPlanDate === "string") {
      setNextPlanDate(data.nextPlanDate);
      if (data.nextPlanDate) setPlanDateTouched(true);
    }
    if (typeof data.vocabTotal === "string") setVocabTotal(data.vocabTotal);
    if (data.entries && typeof data.entries === "object") {
      setEntries((prev) => {
        const next = { ...prev };
        for (const studentId of Object.keys(next)) {
          const saved = data.entries?.[studentId];
          if (saved) {
            next[studentId] = { ...next[studentId], ...saved };
          }
        }
        return next;
      });
    }
    draftIdRef.current = draft.id;
    lastSavedSnapshotRef.current = null;
    setDraftPrompt(false);
    setAutosave({ status: "saved", savedAtLabel: kstTimeLabel(draft.updatedAt) });
  };

  const discardDraft = () => {
    if (!draft) {
      return;
    }
    setDraftPrompt(false);
    if (draftIdRef.current === draft.id) {
      draftIdRef.current = null;
    }
    void discardDailyLogDraftAction(draft.id);
  };

  // 칭찬 한표 인라인 에디터: 열려 있는 학생 id + 작성 중인 draft
  // editIndex가 null이면 새 칭찬 추가, 숫자면 해당 index 칭찬 수정
  const [praiseOpenFor, setPraiseOpenFor] = useState<string | null>(null);
  const [praiseDraft, setPraiseDraft] = useState("");
  const [praiseEditIndex, setPraiseEditIndex] = useState<number | null>(null);

  const updateEntry = (studentId: string, patch: Partial<EntryState>) => {
    setEntries((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  };

  // 숙제 전원 완료: 결석 학생 제외, 저장 전이라 개별 수정 가능
  const markAllHomeworkCompleted = () => {
    setEntries((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([studentId, entry]) => [
          studentId,
          entry.attendance === "absent" ? entry : { ...entry, homeworkStatus: "completed" },
        ]),
      ),
    );
  };

  const applyDefaultProgress = () => {
    if (!defaultProgress.trim()) {
      return;
    }

    setEntries((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([studentId, entry]) => [
          studentId,
          entry.attendance === "absent"
            ? { ...entry, missedProgress: entry.missedProgress || defaultProgress.trim() }
            : { ...entry, progress: defaultProgress.trim() },
        ]),
      ),
    );
  };

  const appendPreset = (studentId: string, field: "strengths" | "improvements", preset: string) => {
    const current = entries[studentId][field];

    // 같은 quick comment를 두 번 눌러도 문장이 반복되지 않게 한다.
    if (current.includes(preset)) {
      return;
    }

    updateEntry(studentId, { [field]: current ? `${current.trimEnd()} ${preset}` : preset });
  };

  const save = (status: "draft" | "completed") => {
    setError("");
    // 다음 수업 계획은 내용+날짜 한 쌍 (날짜는 수업일 이후)
    if (nextLessonPlan.trim() && !nextPlanDate) {
      setError("다음 수업 계획 날짜를 선택해주세요.");
      return;
    }
    if (nextPlanDate && classDate && nextPlanDate <= classDate) {
      setError("다음 수업 계획 날짜는 수업일 이후로 선택해주세요.");
      return;
    }
    finalSavingRef.current = true; // final 저장 중 autosave tick 중단
    startTransition(async () => {
      const result = await saveDailyLogAction({
        dailyLogId,
        draftId: draftIdRef.current,
        classDate,
        groupId: group.id,
        title,
        defaultProgress,
        memo,
        homework,
        nextLessonPlan,
        nextPlanDate: nextLessonPlan.trim() ? nextPlanDate : "",
        vocabTotal,
        status,
        students: students.map((student) => {
          const entry = entries[student.studentId];
          return {
            studentId: student.studentId,
            attendance: entry.attendance,
            progress: entry.progress,
            strengths: entry.strengths,
            improvements: entry.improvements,
            memo: entry.memo,
            missedProgress: entry.missedProgress,
            needsMakeup: entry.needsMakeup,
            makeupScheduledDate: entry.makeupScheduledDate,
            homeworkStatus: entry.homeworkStatus as "" | "completed" | "partial" | "missing",
            vocabCorrect: entry.vocabCorrect,
            vocabRetest: entry.vocabRetest,
            focusLevel: entry.focusLevel as "" | "good" | "normal" | "distracted",
            participationLevel: entry.participationLevel as "" | "active" | "normal" | "passive",
            questionLevel: entry.questionLevel as "" | "high" | "normal" | "low",
            kindnessLevel: entry.kindnessLevel as "" | "good" | "normal" | "poor",
            effortLevel: entry.effortLevel as "" | "high" | "normal" | "low",
            parentNoteNeeded: entry.parentNoteNeeded,
            parentNote: entry.parentNote,
            praiseComments: entry.praiseComments,
          };
        }),
      });

      finalSavingRef.current = false;

      if (result && "duplicate" in result && result.duplicate) {
        setShowSummary(false);
        setDuplicateOpen(true);
        return;
      }

      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div
      className="space-y-5"
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
    >
      {/* 자동 임시저장 상태 — final 저장과 별개인 background 보호 표시 */}
      {autosave.status !== "idle" ? (
        <div className="-mb-3 flex justify-end text-[11px]">
          {autosave.status === "saving" ? (
            <span className="flex items-center gap-1 text-[#a79996]">
              <Cloud className="h-3 w-3" aria-hidden /> 저장 중...
            </span>
          ) : autosave.status === "saved" ? (
            <span className="flex items-center gap-1 text-[#7ba58f]">
              <Cloud className="h-3 w-3" aria-hidden /> 임시저장됨 · {autosave.savedAtLabel}
            </span>
          ) : (
            <span className="text-[#b0766f]">임시저장 실패 · 입력 내용은 화면에 남아 있어요</span>
          )}
        </div>
      ) : null}

      {autoRestored && draft ? (
        <div className="rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-2.5 text-sm text-[#2f6d54]">
          임시저장 내용을 복원했어요 · 마지막 저장 {kstTimeLabel(draft.updatedAt)} — 이어서
          작성하고 저장해주세요.
        </div>
      ) : null}

      {draftPrompt && draft ? (
        <div className="rounded-2xl border border-[#e8ddf3] bg-[#fbf8ff] px-4 py-3 text-sm text-[#4d3a3a]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              임시저장된 내용이 있어요 · 마지막 저장 {kstTimeLabel(draft.updatedAt)}
            </span>
            <span className="flex gap-2">
              <Button type="button" size="sm" onClick={restoreDraft}>
                불러오기
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={discardDraft}>
                버리기
              </Button>
            </span>
          </div>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-[#6652b9]" />
            수업 기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* iPad Safari date input은 intrinsic min-width가 커서, grid 자식과 input에
              min-w-0/max-w-full이 없으면 옆 칸(수업 그룹)을 침범한다 — 학생 폼과 동일 패턴 */}
          {/* 날짜는 날짜 문자열+Safari native control이 들어갈 만큼만(고정 180px 트랙),
              수업 그룹이 남은 폭(minmax(0,1fr))을 사용한다. lg 미만은 1열 stack —
              겹침이 구조적으로 불가능하고, 두 컨트롤은 min-h로 높이를 정확히 맞춘다. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">날짜</span>
              <input
                type="date"
                value={classDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setClassDate(value);
                  if (!planDateTouched && value) {
                    setNextPlanDate(nextClassDateAfter(scheduleDays, value) ?? "");
                  }
                }}
                className="min-h-[46px] w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8]"
                required
              />
            </label>

            <div className="block min-w-0">
              <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 그룹</span>
              <div className="flex min-h-[46px] min-w-0 items-center justify-between gap-2 rounded-2xl border border-[#ece0db] bg-[#f8f3ef] px-3 py-2.5 text-sm text-[#2b2323]">
                <span className="min-w-0 truncate font-medium">{group.name}</span>
                {!dailyLogId ? (
                  <Link
                    href="/daily-logs/new"
                    className="shrink-0 text-xs text-[#5c4ca8] hover:underline"
                  >
                    변경
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 제목 (선택)</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="Unit 3 본문 독해"
            />
          </label>

          <div className="rounded-2xl bg-[#f5f2ff] p-3">
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <BookOpen className="h-3.5 w-3.5" /> 공통 진도
              </span>
              <textarea
                value={defaultProgress}
                onChange={(event) => setDefaultProgress(event.target.value)}
                rows={6}
                className="min-h-[150px] w-full rounded-2xl border border-[#e2d8f3] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996] max-md:min-h-[135px]"
                placeholder={"오늘 진행한 공통 진도를 자유롭게 적어주세요.\n단원 · 페이지 · 본문 · 문법 · 워크북 등을 여러 줄로 쓸 수 있어요."}
              />
              <div className="mt-2 flex justify-end">
                <Button type="button" variant="secondary" onClick={applyDefaultProgress}>
                  전체 학생에게 적용
                </Button>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <NotebookTabs className="h-3.5 w-3.5 text-[#6652b9]" /> 오늘 숙제
              </span>
              <textarea
                value={homework}
                onChange={(event) => setHomework(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                placeholder={"Workbook p.24~27 / Unit 3 단어 1~30"}
              />
            </label>

            <div className="block min-w-0">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <CircleArrowRight className="h-3.5 w-3.5 text-[#3e7d6b]" /> 다음 수업 계획
              </span>
              <textarea
                value={nextLessonPlan}
                onChange={(event) => setNextLessonPlan(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                placeholder={"Unit 3 p.54~59 / 관계대명사 목적격 복습"}
              />
              {/* 계획 날짜 — header에 두면 iPad 가로(열폭 ~312px)에서 줄바꿈이 생겨
                  textarea 아래 전용 줄로 분리. 기본은 수업일 이후 실제 다음 수업일 */}
              <span className="mt-2 flex min-h-[38px] w-fit max-w-full items-center gap-1.5 rounded-xl border border-[#d8ebe0] bg-[#f4faf7] px-2.5 text-xs font-medium text-[#3e7d6b]">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="shrink-0">계획 날짜</span>
                <input
                  type="date"
                  aria-label="다음 수업 계획 날짜 선택"
                  value={nextPlanDate}
                  min={addDaysStr(classDate, 1)}
                  onChange={(event) => {
                    setNextPlanDate(event.target.value);
                    setPlanDateTouched(true);
                  }}
                  className="min-w-0 max-w-[140px] bg-transparent text-xs font-medium text-[#3e7d6b] outline-none"
                />
              </span>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 메모 (선택)</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="다음 시간 Unit 3 Workbook 진행"
            />
          </label>
        </CardContent>
      </Card>

      <Card className="p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="text-sm font-semibold text-[#2b2323]">빠른 체크</span>
            <label className="flex items-center gap-2 text-sm text-[#564d4d]">
              오늘 단어시험 총 문항
              <input
                inputMode="numeric"
                value={vocabTotal}
                onChange={(event) =>
                  setVocabTotal(
                    isComposingEvent(event) ? event.target.value : digitsOnly(event.target.value),
                  )
                }
                onCompositionEnd={(event) => setVocabTotal(digitsOnly(event.currentTarget.value))}
                className="w-16 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-center text-sm tabular-nums outline-none focus:border-[#c9b9e8]"
                placeholder="20"
                aria-label="오늘 단어시험 총 문항 수"
              />
              문제
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={markAllHomeworkCompleted}>
              숙제 전원 완료로 표시
            </Button>
            <span className="text-xs text-[#8a7b77]">
              시험이 없는 날은 비워두면 돼요. 저장 전까지 학생별로 수정할 수 있어요.
            </span>
          </div>
      </Card>

      <div className="space-y-3">
        {students.map((student) => {
          const entry = entries[student.studentId];
          const isAbsent = entry.attendance === "absent";
          const isExpanded = expanded[student.studentId];

          return (
            <Card key={student.studentId} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8e1ff] to-[#f6dfe9] text-xs font-semibold text-[#4a3c52]"
                  >
                    {student.name.charAt(0)}
                  </span>
                  <span className="font-semibold text-[#2b2323]">{student.name}</span>
                  <span className="rounded-full bg-[#f2effc] px-2 py-0.5 text-[10px] text-[#5f54b8]">
                    {gradeDisplay[student.grade]}
                  </span>
                </div>

                <div className="flex gap-1.5" role="group" aria-label={`${student.name} 출결`}>
                  <button
                    type="button"
                    onClick={() => updateEntry(student.studentId, { attendance: "present" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "present"
                        ? "border-[#bfe3d2] bg-[#edf9f3] text-[#2f6d54]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <CircleCheck className="h-3.5 w-3.5" /> 출석
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEntry(student.studentId, { attendance: "late" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "late"
                        ? "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <Clock3 className="h-3.5 w-3.5" /> 지각
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEntry(student.studentId, { attendance: "absent" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "absent"
                        ? "border-[#f0ccc7] bg-[#fff0ef] text-[#96534c]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <CircleX className="h-3.5 w-3.5" /> 결석
                  </button>
                </div>
              </div>

              {isAbsent ? (
                <div className="mt-3 space-y-3 rounded-2xl bg-[#fff7f5] p-3">
                  <div className="text-xs text-[#96837e]">
                    놓친 수업 · {formatKoreanDate(classDate)} · {group.name}
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#8a5d52]">놓친 진도</span>
                    <input
                      value={entry.missedProgress}
                      onChange={(event) => updateEntry(student.studentId, { missedProgress: event.target.value })}
                      className="w-full rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4] placeholder:text-[#b5a29e]"
                      placeholder={defaultProgress.trim() ? `공통 진도: ${defaultProgress.trim()}` : "놓친 진도를 입력해주세요"}
                    />
                    <span className="mt-1 block text-[11px] text-[#a68e88]">
                      {entry.missedProgress && entry.missedProgress === defaultProgress.trim()
                        ? "수업일지의 진도를 자동으로 가져왔어요. 필요하면 수정할 수 있어요."
                        : !entry.missedProgress
                          ? defaultProgress.trim()
                            ? "비워두면 저장할 때 공통 진도가 자동으로 들어가요."
                            : "수업 진도가 아직 입력되지 않았어요. 직접 입력할 수 있어요."
                          : null}
                    </span>
                  </label>

                  {entry.makeupCompleted ? (
                    <div className="flex items-center gap-2 text-xs text-[#655d5d]">
                      <MakeupStatusBadge status="completed" />
                      이미 완료된 보충수업이 연결되어 있어요. 보충 기록은 보충수업 페이지에서 확인할 수 있어요.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#8a5d52]">보충수업</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              // 보충 필요 체크 시 수업일지의 공통 진도를 놓친 진도로 자동 입력.
                              // 사용자가 이미 적어둔 값은 덮어쓰지 않는다.
                              updateEntry(student.studentId, {
                                needsMakeup: true,
                                missedProgress: entry.missedProgress || defaultProgress.trim(),
                              })
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                              entry.needsMakeup
                                ? "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                                : "border-[#ece0db] bg-white text-[#7c6d69]",
                            )}
                          >
                            <CalendarCheck className="h-3 w-3" /> 보충 필요
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEntry(student.studentId, { needsMakeup: false, makeupScheduledDate: "" })}
                            className={cn(
                              "rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                              !entry.needsMakeup
                                ? "border-[#d9cec9] bg-[#f6f1ee] text-[#655a56]"
                                : "border-[#ece0db] bg-white text-[#7c6d69]",
                            )}
                          >
                            보충 불필요
                          </button>
                        </div>
                      </div>

                      {entry.needsMakeup ? (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#8a5d52]">
                            보충 예정일 (미정이면 비워두세요)
                          </span>
                          <input
                            type="date"
                            value={entry.makeupScheduledDate}
                            onChange={(event) =>
                              updateEntry(student.studentId, { makeupScheduledDate: event.target.value })
                            }
                            className="rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4]"
                          />
                        </label>
                      ) : null}
                    </>
                  )}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#7c6d69]">추가 메모</span>
                    <input
                      value={entry.memo}
                      onChange={(event) => updateEntry(student.studentId, { memo: event.target.value })}
                      className="w-full rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4]"
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2.5 rounded-2xl bg-[#f8f6fc] p-3">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                        <SegmentedToggle
                          label="숙제"
                          value={entry.homeworkStatus}
                          options={homeworkStatusValues.map((value) => ({
                            value,
                            label: homeworkStatusLabels[value],
                          }))}
                          onChange={(next) => updateEntry(student.studentId, { homeworkStatus: next })}
                          activeClass={
                            entry.homeworkStatus === "missing"
                              ? "border-[#f0ccc7] bg-[#fff0ef] text-[#96534c]"
                              : entry.homeworkStatus === "partial"
                                ? "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]"
                                : "border-[#bfe3d2] bg-[#edf9f3] text-[#2f6d54]"
                          }
                        />

                        <div className="flex items-center gap-2" role="group" aria-label={`${student.name} 단어시험`}>
                          <span className="shrink-0 text-xs font-semibold text-[#7c6d69]">단어</span>
                          <input
                            inputMode="numeric"
                            value={entry.vocabCorrect}
                            onChange={(event) =>
                              updateEntry(student.studentId, {
                                vocabCorrect: isComposingEvent(event)
                                  ? event.target.value
                                  : digitsOnly(event.target.value),
                              })
                            }
                            onCompositionEnd={(event) =>
                              updateEntry(student.studentId, {
                                vocabCorrect: digitsOnly(event.currentTarget.value),
                              })
                            }
                            className="w-14 rounded-xl border border-[#ece0db] bg-white px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-[#c9b9e8]"
                            placeholder="-"
                            aria-label={`${student.name} 단어시험 맞은 개수`}
                          />
                          <span className="text-xs tabular-nums text-[#8a7b77]">
                            / {vocabTotal.trim() || "?"}
                            {entry.vocabCorrect && vocabTotal.trim() &&
                            Number(entry.vocabCorrect) <= Number(vocabTotal)
                              ? ` · ${vocabPercent(Number(entry.vocabCorrect), Number(vocabTotal))}%`
                              : ""}
                          </span>
                          <button
                            type="button"
                            aria-pressed={entry.vocabRetest}
                            onClick={() => updateEntry(student.studentId, { vocabRetest: !entry.vocabRetest })}
                            className={cn(
                              "min-h-[38px] rounded-xl border px-2.5 py-1.5 text-xs font-medium transition",
                              entry.vocabRetest
                                ? "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                                : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                            )}
                          >
                            재시험 필요
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                        <SegmentedToggle
                          label="집중"
                          value={entry.focusLevel}
                          options={focusLevelValues.map((value) => ({
                            value,
                            label: focusLevelLabels[value],
                          }))}
                          onChange={(next) => updateEntry(student.studentId, { focusLevel: next })}
                          activeClass="border-[#c9dcec] bg-[#eef6fb] text-[#3c6478]"
                        />
                        <SegmentedToggle
                          label="참여"
                          value={entry.participationLevel}
                          options={participationLevelValues.map((value) => ({
                            value,
                            label: participationLevelLabels[value],
                          }))}
                          onChange={(next) => updateEntry(student.studentId, { participationLevel: next })}
                          activeClass="border-[#d3cbee] bg-[#f0ecfb] text-[#54479c]"
                        />
                        <SegmentedToggle
                          label="질문"
                          value={entry.questionLevel}
                          options={questionLevelValues.map((value) => ({
                            value,
                            label: questionLevelLabels[value],
                          }))}
                          onChange={(next) => updateEntry(student.studentId, { questionLevel: next })}
                          activeClass="border-[#c9dcec] bg-[#eef6fb] text-[#3c6478]"
                        />
                        <SegmentedToggle
                          label="배려"
                          value={entry.kindnessLevel}
                          options={kindnessLevelValues.map((value) => ({
                            value,
                            label: kindnessLevelLabels[value],
                          }))}
                          onChange={(next) => updateEntry(student.studentId, { kindnessLevel: next })}
                          activeClass="border-[#f0d3dd] bg-[#fbeef3] text-[#a05a7c]"
                        />
                        <SegmentedToggle
                          label="노력"
                          value={entry.effortLevel}
                          options={effortLevelValues.map((value) => ({
                            value,
                            label: effortLevelLabels[value],
                          }))}
                          onChange={(next) => updateEntry(student.studentId, { effortLevel: next })}
                          activeClass="border-[#cbe0d3] bg-[#e9f6ef] text-[#2f6d54]"
                        />
                      </div>

                      {entry.praiseComments.length > 0 ? (
                        <div className="space-y-1.5">
                          {entry.praiseComments.map((comment, praiseIndex) => (
                            <div
                              key={`${praiseIndex}-${comment}`}
                              className="flex items-start gap-2 rounded-xl bg-[#f6effa] px-3 py-1.5 text-xs text-[#7a5a92]"
                            >
                              <span aria-hidden className="shrink-0">💜</span>
                              <span className="min-w-0 flex-1 break-words leading-5">{comment}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPraiseDraft(comment);
                                  setPraiseEditIndex(praiseIndex);
                                  setPraiseOpenFor(student.studentId);
                                }}
                                className="shrink-0 font-medium text-[#5c4ca8] hover:underline"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                aria-label={`${student.name} 칭찬 삭제`}
                                onClick={() =>
                                  updateEntry(student.studentId, {
                                    praiseComments: entry.praiseComments.filter(
                                      (_, index) => index !== praiseIndex,
                                    ),
                                  })
                                }
                                className="shrink-0 text-[#a68cbf] hover:text-[#7a5a92]"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        {/* 칭찬이 몇 개 있어도 추가 버튼은 항상 표시 */}
                        <button
                          type="button"
                          onClick={() => {
                            if (praiseOpenFor === student.studentId && praiseEditIndex === null) {
                              setPraiseOpenFor(null);
                            } else {
                              setPraiseDraft("");
                              setPraiseEditIndex(null);
                              setPraiseOpenFor(student.studentId);
                            }
                          }}
                          aria-expanded={praiseOpenFor === student.studentId}
                          className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#ddd0ec] bg-[#f9f5fd] px-3 py-1.5 text-xs font-medium text-[#6d5aa8] transition hover:bg-[#f3ecfa]"
                        >
                          💜 칭찬 한표 +
                        </button>

                        <button
                          type="button"
                          aria-pressed={entry.parentNoteNeeded}
                          onClick={() =>
                            updateEntry(student.studentId, { parentNoteNeeded: !entry.parentNoteNeeded })
                          }
                          className={cn(
                            "ml-auto min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                            entry.parentNoteNeeded
                              ? "border-[#f0ccc7] bg-[#fff0ef] text-[#96534c]"
                              : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                          )}
                        >
                          학부모 전달 필요
                        </button>
                      </div>

                      {praiseOpenFor === student.studentId ? (
                        <div className="space-y-2 rounded-xl border border-[#e5d9f0] bg-white p-3">
                          <div className="text-xs font-semibold text-[#6d5aa8]">
                            {praiseEditIndex === null ? "칭찬 한표 💜" : "칭찬 수정 💜"}
                          </div>
                          <div className="text-[11px] text-[#8a7b77]">
                            성장노트에 보여줄 짧은 칭찬이에요. 오늘 잘한 모습을 짧게 적어주세요.
                          </div>
                          <textarea
                            value={praiseDraft}
                            // IME-safe: 조합 중 값 재작성 금지 — 길이 제한은 native maxLength가 담당
                            onChange={(event) => setPraiseDraft(event.target.value)}
                            rows={2}
                            maxLength={120}
                            autoFocus
                            className="w-full resize-none rounded-xl border border-[#e5d9f0] bg-white px-3 py-2 text-base outline-none focus:border-[#c9b9e8] sm:text-sm"
                            placeholder="어려운 문제도 끝까지 다시 풀어보는 모습이 좋았어요."
                            aria-label={`${student.name} 칭찬 코멘트`}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] tabular-nums text-[#a79996]">
                              {praiseDraft.length} / 120
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setPraiseOpenFor(null);
                                  setPraiseEditIndex(null);
                                }}
                                className="rounded-xl border border-[#ece0db] bg-white px-3 py-1.5 text-xs font-medium text-[#7c6d69] transition hover:bg-[#faf6f3]"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                disabled={!praiseDraft.trim()}
                                onClick={() => {
                                  const trimmed = praiseDraft.trim();
                                  updateEntry(student.studentId, {
                                    praiseComments:
                                      praiseEditIndex === null
                                        ? [...entry.praiseComments, trimmed]
                                        : entry.praiseComments.map((comment, index) =>
                                            index === praiseEditIndex ? trimmed : comment,
                                          ),
                                  });
                                  setPraiseOpenFor(null);
                                  setPraiseEditIndex(null);
                                }}
                                className="rounded-xl bg-[#6d5aa8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5d4ba5] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {praiseEditIndex === null ? "칭찬 추가" : "칭찬 저장"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {entry.parentNoteNeeded ? (
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-[#96534c]">전달 내용</span>
                          <input
                            value={entry.parentNote}
                            onChange={(event) =>
                              updateEntry(student.studentId, { parentNote: event.target.value })
                            }
                            className="w-full rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4]"
                            placeholder="최근 숙제 미제출이 두 번 있었습니다."
                          />
                        </label>
                      ) : null}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex flex-1 items-center gap-2 rounded-xl border border-[#efe4dd] bg-[#fdfaf8] px-3 py-2">
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#7c6d69]" />
                      <input
                        value={entry.progress}
                        onChange={(event) => updateEntry(student.studentId, { progress: event.target.value })}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-[#a79996]"
                        placeholder="진도"
                        aria-label={`${student.name} 진도`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [student.studentId]: !prev[student.studentId] }))
                      }
                      className="flex items-center justify-center gap-1 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-xs font-medium text-[#564d4d] transition hover:bg-[#faf6f3]"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      코멘트 {isExpanded ? "접기" : "입력"}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-[#edf8f2] p-3">
                        <div className="mb-2 text-xs font-semibold text-[#2f5d4b]">잘한 부분</div>
                        <textarea
                          value={entry.strengths}
                          onChange={(event) => updateEntry(student.studentId, { strengths: event.target.value })}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-[#dfeee6] bg-white px-3 py-2 text-sm outline-none focus:border-[#bcdccb]"
                          aria-label={`${student.name} 잘한 부분`}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {strengthPresets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => appendPreset(student.studentId, "strengths", preset)}
                              className="rounded-full border border-[#d8ebe0] bg-white px-2 py-0.5 text-[11px] text-[#3d6d58] transition hover:bg-[#f0faf5]"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#fff3ef] p-3">
                        <div className="mb-2 text-xs font-semibold text-[#8a5d52]">보완할 부분</div>
                        <textarea
                          value={entry.improvements}
                          onChange={(event) => updateEntry(student.studentId, { improvements: event.target.value })}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-[#f5e3df] bg-white px-3 py-2 text-sm outline-none focus:border-[#eccec7]"
                          aria-label={`${student.name} 보완할 부분`}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {improvementPresets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => appendPreset(student.studentId, "improvements", preset)}
                              className="rounded-full border border-[#f2ded8] bg-white px-2 py-0.5 text-[11px] text-[#8a5d52] transition hover:bg-[#fdf4f1]"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-xs font-semibold text-[#7c6d69]">추가 메모</span>
                        <input
                          value={entry.memo}
                          onChange={(event) => updateEntry(student.studentId, { memo: event.target.value })}
                          className="w-full rounded-xl border border-[#efe4dd] bg-white px-3 py-2 text-sm outline-none focus:border-[#dcc9c0]"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-3 text-sm text-[#7f5d57]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pb-8">
        <Button type="button" variant="secondary" disabled={isPending} onClick={() => save("draft")}>
          {isPending ? "저장 중..." : "임시 저장"}
        </Button>
        <Button type="button" disabled={isPending} onClick={() => setShowSummary(true)} className="gap-2">
          <CheckCheck className="h-4 w-4" />
          수업 기록 완료
        </Button>
        <span className="text-xs text-[#8a7b77]">
          임시 저장한 일지는 목록에서 &quot;작성 중&quot;으로 표시돼요.
        </span>
      </div>

      {importConfirmText !== null ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="공통 진도 덮어쓰기 확인"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="font-display text-lg font-semibold text-[#2a2323]">
              현재 작성한 공통 진도가 있어요
            </div>
            <p className="mt-2 text-sm leading-6 text-[#655d5d]">
              기존 내용을 이전 기록에서 가져온 내용으로 바꿀까요?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setImportConfirmText(null)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                autoFocus
                onClick={() => {
                  setDefaultProgress(importConfirmText);
                  setImportConfirmText(null);
                }}
              >
                바꾸기
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="수업일지 중복 안내"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDuplicateOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="text-lg font-semibold text-[#2a2323]">수업일지가 이미 있어요</div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#564d4d]">
              {`${formatKoreanDate(classDate)}에 이미 등록된 수업 일지가 있어요.\n같은 반의 수업 일지는 하루에 한 번만 등록할 수 있어요.\n기존 수업 일지를 수정하거나 삭제 후 다시 등록해주세요.`}
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" size="sm" onClick={() => setDuplicateOpen(false)}>
                확인
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showSummary ? (
        <CompletionSummary
          groupName={group.name}
          defaultProgress={defaultProgress}
          homework={homework}
          nextLessonPlan={nextLessonPlan}
          students={students}
          entries={entries}
          isPending={isPending}
          onBack={() => setShowSummary(false)}
          onComplete={() => save("completed")}
        />
      ) : null}
    </div>
  );
}

function CompletionSummary({
  groupName,
  defaultProgress,
  homework,
  nextLessonPlan,
  students,
  entries,
  isPending,
  onBack,
  onComplete,
}: {
  groupName: string;
  defaultProgress: string;
  homework: string;
  nextLessonPlan: string;
  students: DailyLogFormStudent[];
  entries: Record<string, EntryState>;
  isPending: boolean;
  onBack: () => void;
  onComplete: () => void;
}) {
  const counts = { present: 0, late: 0, absent: 0 };

  // 오늘 체크할 학생: 실제 attention 항목이 있는 학생만 (정상 학생은 나열하지 않음)
  const checkStudents: { name: string; items: string[] }[] = [];

  for (const student of students) {
    const entry = entries[student.studentId];
    counts[entry.attendance] += 1;

    const items: string[] = [];

    if (entry.attendance === "absent") {
      items.push(entry.needsMakeup ? "결석 · 보충 필요" : "결석");
    }
    if (entry.homeworkStatus === "missing") {
      items.push("숙제 미제출");
    } else if (entry.homeworkStatus === "partial") {
      items.push("숙제 일부 완료");
    }
    if (entry.vocabRetest) {
      items.push("단어 재시험 필요");
    }
    if (entry.parentNoteNeeded && entry.parentNote.trim()) {
      items.push("학부모 전달 필요");
    }

    if (items.length > 0) {
      checkStudents.push({ name: student.name, items });
    }
  }

  const reminders = [
    !homework.trim() ? "오늘 숙제가 비어 있어요." : null,
    !nextLessonPlan.trim() ? "다음 수업 계획이 비어 있어요." : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b2323]/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="오늘 수업 마무리"
    >
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="flex items-center gap-2 text-lg font-semibold text-[#2a2323]">
          <CheckCheck className="h-5 w-5 text-[#6852b8]" />
          오늘 수업 마무리
        </div>
        <div className="mt-1 text-sm text-[#756a67]">{groupName}</div>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl bg-[#f8f3ef] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">진도</div>
            <div className="mt-1 whitespace-pre-line font-medium text-[#2b2323]">
              {defaultProgress.trim() || "입력된 진도가 없어요."}
            </div>
          </div>

          <div className="rounded-2xl bg-[#f5f2ff] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">출결</div>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[#3d7f64]">출석 {counts.present}명</span>
              <span className="rounded-full bg-[#fdf3e4] px-2 py-1 text-[#94702f]">지각 {counts.late}명</span>
              <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[#a26660]">결석 {counts.absent}명</span>
            </div>
          </div>

          <div className="rounded-2xl bg-[#f8f3ef] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">오늘 숙제</div>
            <div className="mt-1 whitespace-pre-line font-medium text-[#2b2323]">
              {homework.trim() || "입력된 숙제가 없어요."}
            </div>
          </div>

          {checkStudents.length > 0 ? (
            <div className="rounded-2xl bg-[#fff7f5] p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#a26660]">
                오늘 체크할 학생 {checkStudents.length}명
              </div>
              <div className="mt-2 space-y-2">
                {checkStudents.map((item) => (
                  <div key={item.name}>
                    <div className="font-medium text-[#8a5d52]">{item.name}</div>
                    <ul className="mt-0.5 text-xs leading-5 text-[#a26660]">
                      {item.items.map((flag) => (
                        <li key={flag}>• {flag}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-[#edf9f3] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">다음 수업</div>
            <div className="mt-1 whitespace-pre-line font-medium text-[#2b2323]">
              {nextLessonPlan.trim() || "입력된 계획이 없어요."}
            </div>
          </div>

          {reminders.length > 0 ? (
            <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] p-3 text-[#7f5d57]">
              {reminders.map((reminder) => (
                <div key={reminder} className="flex items-center gap-1.5 text-sm">
                  <span aria-hidden>•</span> {reminder}
                </div>
              ))}
              <div className="mt-1 text-xs text-[#a08883]">그래도 그대로 완료할 수 있어요.</div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={onBack}>
            돌아가서 수정
          </Button>
          <Button type="button" disabled={isPending} onClick={onComplete} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            {isPending ? "저장 중..." : "수업 마무리 완료"}
          </Button>
        </div>
      </div>
    </div>
  );
}
