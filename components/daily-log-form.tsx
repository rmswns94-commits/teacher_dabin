"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  DoorOpen,
  NotebookPen,
  NotebookTabs,
  Plus,
  Sparkles,
  Trash2,
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
import { createStudentWeaknessAction } from "@/app/students/weakness-actions";
import { WeaknessFormDialog, type WeaknessFormValues } from "@/components/weakness-form-dialog";
import { improvementPresets, strengthPresets } from "@/lib/constants/lesson-comments";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import { nextClassDateAfter } from "@/lib/schedule";
import { vocabWordKey } from "@/lib/vocab";
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
  vocabMistakes?: string[];
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
  vocabMistakes: string[];
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
    vocabMistakes: student.vocabMistakes ?? [],
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
  homeworkDueDate: string;
  // 오늘 숙제(구조화) — draft 단계에서는 payload에만 유지 (row 생성 없음)
  homeworkAssignments: { id: string | null; content: string; dueDate: string }[];
  nextLessonPlan: string;
  nextPlanDate: string;
  // 해야 할 일 (공용 Todo 연결) — draft 단계에서는 payload에만 유지 (Todo 생성 없음)
  taskContent: string;
  taskDate: string;
  vocabTotal: string;
  reflectionGood: string;
  reflectionHard: string;
  reflectionNext: string;
  entries: Record<string, EntryState>;
};

// 오늘 숙제 폼 항목 — key는 React 렌더용 안정 identity (삭제/재정렬에도 값이 섞이지 않게),
// id는 저장된 row id (수정 sync용, 새 항목은 null). 저장/스냅샷에는 key를 싣지 않는다.
type AssignmentItem = { key: string; id: string | null; content: string; dueDate: string };

function restoredAssignments(value: unknown): AssignmentItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .filter(
      (item): item is { id?: unknown; content: string; dueDate: string } =>
        Boolean(item) &&
        typeof (item as { content?: unknown }).content === "string" &&
        typeof (item as { dueDate?: unknown }).dueDate === "string",
    )
    .map((item) => ({
      key: globalThis.crypto.randomUUID(),
      id: typeof item.id === "string" ? item.id : null,
      content: item.content,
      dueDate: item.dueDate,
    }));
}

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

// 틀린 단어 chip 입력 — Enter 또는 [추가]로 등록, chip ✕로 삭제.
// 쉼표/줄바꿈으로 구분하면 한 번에 여러 단어가 등록된다 ("a, b, c" → chip 3개).
// 공백은 구분자가 아니다 — "give up" 같은 구동사를 한 단어로 적을 수 있게.
// 같은 시험 안 중복(대소문자/공백 무시)은 추가 시점에 조용히 걸러준다.
// IME-safe: 조합 중 Enter는 submit으로 오인하지 않는다 (한국어 입력 대비).
function VocabMistakeChips({
  studentName,
  words,
  onChange,
}: {
  studentName: string;
  words: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const incoming = draft
      .split(/[,\n·]/)
      .map((part) => part.trim().replace(/\s+/g, " "))
      // 단어당 60자 제한(검증 스키마와 동일) — 초과분은 저장에서 막히기 전에 여기서 거른다
      .filter((part) => part && part.length <= 60);

    if (incoming.length === 0) {
      return;
    }

    const next = [...words];
    const seen = new Set(words.map((existing) => vocabWordKey(existing)));

    for (const word of incoming) {
      const key = vocabWordKey(word);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      next.push(word);
    }

    if (next.length > words.length) {
      onChange(next);
    }

    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${studentName} 틀린 단어`}>
      <span className="w-8 shrink-0 text-xs font-semibold text-[#7c6d69]">오답</span>
      {words.map((word) => (
        <span
          key={word}
          className="flex min-h-[34px] items-center gap-1.5 rounded-xl bg-[#f0ecfb] px-2.5 py-1 text-xs text-[#54479c]"
        >
          {word}
          <button
            type="button"
            aria-label={`${word} 오답에서 삭제`}
            onClick={() => onChange(words.filter((existing) => existing !== word))}
            className="text-[#9a8db5] transition hover:text-[#54479c]"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        // IME-safe: 조합 중 값 재작성 금지 — 길이 제한은 native maxLength가 담당
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (isComposingEvent(event)) {
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        maxLength={200}
        placeholder="틀린 단어 (쉼표로 여러 개)"
        className="w-44 min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#c9b9e8]"
        aria-label={`${studentName} 틀린 단어 입력`}
      />
      <button
        type="button"
        onClick={add}
        disabled={!draft.trim()}
        className="min-h-[38px] rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-xs font-medium text-[#7c6d69] transition hover:bg-[#faf6f3] disabled:opacity-40"
      >
        추가
      </button>
    </div>
  );
}

// 상단/하단 공용 저장 액션 — 새 form/state/action 없이 부모의 handler·pending을
// 그대로 받는 presentational 컴포넌트. 두 위치 모두 같은 함수 reference를 사용한다.
function SaveActions({
  isPending,
  onDraft,
  onFinal,
}: {
  isPending: boolean;
  onDraft: () => void;
  onFinal: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={onDraft}
        className="min-h-[44px]"
      >
        {isPending ? "저장 중..." : "임시 저장"}
      </Button>
      <Button
        type="button"
        disabled={isPending}
        onClick={onFinal}
        className="min-h-[44px] gap-2"
      >
        <CheckCheck className="h-4 w-4" />
        수업 기록 완료
      </Button>
    </>
  );
}

export function DailyLogForm({
  dailyLogId,
  classDate: initialClassDate,
  group,
  students,
  scheduleDays = [],
  draft = null,
  forceRestoreDraft = false,
  draftPromptOnly = false,
  initial,
  initialAssignments = [],
  previousReflection = null,
  textbooks = [],
}: {
  dailyLogId?: string;
  classDate: string;
  group: { id: string; name: string; grade?: string };
  students: DailyLogFormStudent[];
  // 그룹 시간표 요일 (다음 수업 계획 기본 날짜 계산용 — 없으면 날짜 직접 선택)
  scheduleDays?: number[];
  // 이 그룹의 교재 목록 (class_groups.textbook 줄바꿈 구분 — 수업 제목 옆 "교재 LIST" 보조 버튼용.
  // 제목에 텍스트를 한 번 삽입할 뿐, 교재 상태/관계를 만들거나 제목과 동기화하지 않는다)
  textbooks?: string[];
  // 서버에서 발견한 자동 임시저장 draft (있으면 복구 배너 표시 — 자동 덮어쓰기 없음)
  draft?: { id: string; updatedAt: string; payload: unknown } | null;
  // [수업 일지 작성하기] resume 진입: 10분 창과 무관하게 draft를 즉시 전체 복원
  // (새 작성 화면 전용 — draft가 유일한 작성 내용이라 덮어쓸 원본이 없다)
  forceRestoreDraft?: boolean;
  // 수정 화면에서 같은 identity의 "새 작성" 자동 임시저장을 fallback으로 받은 경우:
  // 자동 적용하면 일지 row 내용을 덮어쓰므로, 배너로만 안내하고 사용자가 [불러오기]를 선택한다.
  // autosave도 이 draft id를 이어받지 않는다 (수정 세션은 자기 identity로 새로 저장).
  draftPromptOnly?: boolean;
  initial?: {
    title: string;
    defaultProgress: string;
    memo: string;
    homework: string;
    homeworkDueDate?: string;
    nextLessonPlan: string;
    nextPlanDate?: string;
    taskContent?: string;
    taskDate?: string;
    vocabTotal?: string;
    reflectionGood?: string;
    reflectionHard?: string;
    reflectionNext?: string;
  };
  // 오늘 숙제(구조화) — 수정 화면에서 기존 row 복원용 (id 기반 sync)
  initialAssignments?: { id: string; content: string; dueDate: string }[];
  // 같은 그룹 직전 completed 일지의 "다음에 다르게 해볼 것" — 회고 카드에 리마인드로 표시
  previousReflection?: { classDate: string; reflectionNext: string } | null;
}) {
  // 최근(10분 내) 임시저장 draft는 mount 시점에 자동 복원 — reload 복구가 목적이라
  // effect/remount 없이 초기 state로만 반영한다 (IME/입력에 영향 없음).
  // resume 진입(forceRestoreDraft)은 시간 창과 무관하게 항상 복원한다.
  const [autoRestored] = useState(() =>
    Boolean(
      draft &&
        !draftPromptOnly &&
        (forceRestoreDraft || currentEpochMs() - Date.parse(draft.updatedAt) < AUTO_RESTORE_WINDOW_MS),
    ),
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
  // 교재 LIST 드롭다운 — 제목 입력을 돕는 보조 도구일 뿐, 선택값을 따로 저장하지 않는다
  const [textbookListOpen, setTextbookListOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const insertTextbookIntoTitle = (book: string) => {
    setTextbookListOpen(false);
    setTitle((current) => {
      // 이미 제목에 들어 있으면 중복 삽입하지 않는다
      if (current.includes(book)) {
        return current;
      }
      return current.trim() ? `${book} - ${current}` : book;
    });
    // 이어서 바로 수정할 수 있게 제목 입력으로 focus 반환
    titleInputRef.current?.focus();
  };
  const [defaultProgress, setDefaultProgress] = useState(
    restoredText(restored?.defaultProgress, initial?.defaultProgress ?? ""),
  );
  const [memo, setMemo] = useState(restoredText(restored?.memo, initial?.memo ?? ""));
  // 오늘 숙제(구조화): draft 복원 → 저장된 row 순
  const [assignments, setAssignments] = useState<AssignmentItem[]>(
    () =>
      restoredAssignments(restored?.homeworkAssignments) ??
      initialAssignments.map((item) => ({
        key: globalThis.crypto.randomUUID(),
        id: item.id,
        content: item.content,
        dueDate: item.dueDate,
      })),
  );
  // legacy free-text 숙제: 구조화 row가 있는 일지는 homework 필드가 파생 mirror라 폼에 싣지 않는다
  // (legacy 일지는 기존처럼 편집 — 데이터/Todo 연동 동작 그대로)
  const legacyHomeworkFallback = initialAssignments.length > 0 ? "" : initial?.homework ?? "";
  const [homework, setHomework] = useState(
    restoredText(restored?.homework, legacyHomeworkFallback),
  );
  // legacy 입력칸 표시는 mount 시점에 고정 (지우는 중에 칸이 사라지지 않게)
  const [showLegacyHomework] = useState(() =>
    Boolean(restoredText(restored?.homework, legacyHomeworkFallback).trim()),
  );
  // 숙제 날짜(선택): 고르면 그 날짜의 To Do로 숙제가 노출된다 — 기본값 없음(옵트인)
  const [homeworkDueDate, setHomeworkDueDate] = useState(
    restoredText(restored?.homeworkDueDate, "") || initial?.homeworkDueDate || "",
  );
  // 수업 회고 (강사 자기 성찰) — 전부 선택 입력, 값이 있으면 카드 자동 펼침
  const [reflectionGood, setReflectionGood] = useState(
    restoredText(restored?.reflectionGood, initial?.reflectionGood ?? ""),
  );
  const [reflectionHard, setReflectionHard] = useState(
    restoredText(restored?.reflectionHard, initial?.reflectionHard ?? ""),
  );
  const [reflectionNext, setReflectionNext] = useState(
    restoredText(restored?.reflectionNext, initial?.reflectionNext ?? ""),
  );
  const [reflectionOpen, setReflectionOpen] = useState(() =>
    Boolean(
      restoredText(restored?.reflectionGood, initial?.reflectionGood ?? "") ||
        restoredText(restored?.reflectionHard, initial?.reflectionHard ?? "") ||
        restoredText(restored?.reflectionNext, initial?.reflectionNext ?? ""),
    ),
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
  // 해야 할 일 — 다음 수업 계획(수업 내용)과 별개인 Teacher 작업.
  // [수업 기록 완료] 시에만 공용 Todo 1개로 연결된다 (draft/autosave는 payload에만).
  const [taskContent, setTaskContent] = useState(
    restoredText(restored?.taskContent, initial?.taskContent ?? ""),
  );
  const [taskDate, setTaskDate] = useState(
    () =>
      restoredText(restored?.taskDate, "") ||
      initial?.taskDate ||
      nextClassDateAfter(scheduleDays, initialClassDate) ||
      "",
  );
  const [taskDateTouched, setTaskDateTouched] = useState(
    Boolean(restoredText(restored?.taskDate, "") || initial?.taskDate),
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
  // 같은 날짜+같은 반 일지가 이미 있을 때 전용 경고 dialog (form 내용은 보존).
  // 기존 일지 id가 있으면 "이어쓰기" 링크를 제공한다 — 삭제/재작성 강요 없이 복구.
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateExistingId, setDuplicateExistingId] = useState<string | null>(null);

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
  const router = useRouter();

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
      homeworkDueDate,
      // key(렌더용)는 제외 — draft payload/스냅샷에는 저장 데이터만
      homeworkAssignments: assignments.map(({ id, content, dueDate }) => ({ id, content, dueDate })),
      nextLessonPlan,
      nextPlanDate,
      taskContent,
      taskDate,
      vocabTotal,
      reflectionGood,
      reflectionHard,
      reflectionNext,
      entries,
    };
    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = JSON.stringify(formStateRef.current);
    }
  }, [classDate, title, defaultProgress, memo, homework, homeworkDueDate, assignments, nextLessonPlan, nextPlanDate, taskContent, taskDate, vocabTotal, reflectionGood, reflectionHard, reflectionNext, entries]);
  useEffect(
    () =>
      registerDirtyCheck(
        () => JSON.stringify(formStateRef.current) !== initialSnapshotRef.current,
      ),
    [],
  );

  // 새로고침/탭 닫기 보호 — 다른 폼들과 달리 이 폼만 빠져 있었다 (앱에서 가장 큰 입력 폼).
  // dirty 판정은 이벤트 시점에만 lazy로 수행해 keystroke 비용 0 (한글 조합에 영향 없음).
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(formStateRef.current) !== initialSnapshotRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

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
  // promptOnly(다른 identity의 fallback draft)면 autosave가 그 id를 이어받지 않는다
  const draftIdRef = useRef<string | null>(draftPromptOnly ? null : draft?.id ?? null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const autosaveInFlightRef = useRef(false);
  const composingRef = useRef(false);
  const finalSavingRef = useRef(false);
  // [임시 저장]으로 생성/갱신된 일지 id — 이후 저장이 insert가 아니라 update가 되도록
  // payload의 dailyLogId로 항상 이 값을 쓴다 (edit 화면은 prop으로 이미 채워져 있음).
  const persistedLogIdRef = useRef<string | null>(dailyLogId ?? null);
  const [draftSavedNotice, setDraftSavedNotice] = useState("");

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
      let result: Awaited<ReturnType<typeof autosaveDailyLogDraftAction>>;
      try {
        result = await autosaveDailyLogDraftAction({
          draftId: draftIdRef.current,
          dailyLogId: persistedLogIdRef.current,
          groupId: group.id,
          classDate: classDateNow,
          payload: formStateRef.current,
        });
      } catch (error) {
        // 오프라인 등으로 promise가 reject돼도 in-flight 플래그가 잠기지 않게 한다
        // (안 그러면 이 폼 세션의 autosave가 영구 중단된다)
        console.error("autosave request failed", error);
        setAutosave({ status: "error" });
        return;
      } finally {
        autosaveInFlightRef.current = false;
      }
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
      homeworkDueDate: string;
      homeworkAssignments: unknown;
      taskContent: string;
      taskDate: string;
      nextLessonPlan: string;
      nextPlanDate: string;
      vocabTotal: string;
      reflectionGood: string;
      reflectionHard: string;
      reflectionNext: string;
      entries: Record<string, EntryState>;
    }>;
    if (typeof data.classDate === "string" && data.classDate) setClassDate(data.classDate);
    if (typeof data.title === "string") setTitle(data.title);
    if (typeof data.defaultProgress === "string") setDefaultProgress(data.defaultProgress);
    if (typeof data.memo === "string") setMemo(data.memo);
    if (typeof data.homework === "string") setHomework(data.homework);
    if (typeof data.homeworkDueDate === "string") setHomeworkDueDate(data.homeworkDueDate);
    {
      const restoredHw = restoredAssignments(data.homeworkAssignments);
      if (restoredHw) setAssignments(restoredHw);
    }
    if (typeof data.nextLessonPlan === "string") setNextLessonPlan(data.nextLessonPlan);
    if (typeof data.nextPlanDate === "string") {
      setNextPlanDate(data.nextPlanDate);
      if (data.nextPlanDate) setPlanDateTouched(true);
    }
    if (typeof data.taskContent === "string") setTaskContent(data.taskContent);
    if (typeof data.taskDate === "string") {
      setTaskDate(data.taskDate);
      if (data.taskDate) setTaskDateTouched(true);
    }
    if (typeof data.vocabTotal === "string") setVocabTotal(data.vocabTotal);
    if (typeof data.reflectionGood === "string") setReflectionGood(data.reflectionGood);
    if (typeof data.reflectionHard === "string") setReflectionHard(data.reflectionHard);
    if (typeof data.reflectionNext === "string") setReflectionNext(data.reflectionNext);
    if (data.reflectionGood || data.reflectionHard || data.reflectionNext) {
      setReflectionOpen(true); // 복원한 회고가 접힘 뒤에 숨지 않게
    }
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
    if (!draftPromptOnly) {
      draftIdRef.current = draft.id;
    }
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

  // 약점 기록: 공용 WeaknessFormDialog를 학생별로 연다. 일지 폼 내용과 달리
  // 저장 즉시 확정되는 독립 기록 — 일지 재저장/삭제와 무관하게 학생 상세에 남는다.
  const [weaknessOpenFor, setWeaknessOpenFor] = useState<string | null>(null);
  const [weaknessError, setWeaknessError] = useState("");
  const [weaknessSavedFor, setWeaknessSavedFor] = useState<string | null>(null);
  const [weaknessPending, startWeaknessTransition] = useTransition();

  const submitWeakness = (studentId: string, values: WeaknessFormValues) => {
    setWeaknessError("");
    startWeaknessTransition(async () => {
      const result = await createStudentWeaknessAction({
        studentId,
        groupId: group.id,
        // 이미 저장된 일지(수정 화면·임시 저장 후)라면 출처로 연결, 아직 미저장이면 null
        sourceDailyLogId: persistedLogIdRef.current ?? "",
        category: values.category,
        title: values.title,
        note: values.note,
        reviewDueDate: values.reviewDueDate,
      });

      if ("error" in result) {
        setWeaknessError(result.error);
        return;
      }

      setWeaknessOpenFor(null);
      setWeaknessSavedFor(studentId);
      setTimeout(
        () => setWeaknessSavedFor((prev) => (prev === studentId ? null : prev)),
        2500,
      );
    });
  };

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
    setDraftSavedNotice("");
    // 검증 실패는 요약 모달을 닫고 화면의 오류 배너로 보여준다
    // (모달이 열린 채 남으면 아무 일도 안 일어난 것처럼 보인다)
    const failValidation = (message: string) => {
      setShowSummary(false);
      setError(message);
    };

    // 다음 수업 계획은 내용+날짜 한 쌍 (날짜는 수업일 이후)
    if (nextLessonPlan.trim() && !nextPlanDate) {
      failValidation("다음 수업 계획 날짜를 선택해주세요.");
      return;
    }
    if (nextPlanDate && classDate && nextPlanDate <= classDate) {
      failValidation("다음 수업 계획 날짜는 수업일 이후로 선택해주세요.");
      return;
    }
    // 숙제 날짜는 선택 사항 — 골랐다면 수업일 이후여야 그 날 To Do로 뜬다
    if (homework.trim() && homeworkDueDate && classDate && homeworkDueDate <= classDate) {
      failValidation("숙제 날짜는 수업일 이후로 선택해주세요.");
      return;
    }
    // 해야 할 일은 내용+날짜 한 쌍 (수업일 당일부터 허용 — 당일 준비 작업 가능)
    if (taskContent.trim() && !taskDate) {
      failValidation("해야 할 일 날짜를 선택해주세요.");
      return;
    }
    if (taskContent.trim() && taskDate && classDate && taskDate < classDate) {
      failValidation("해야 할 일 날짜는 수업일부터 선택할 수 있어요.");
      return;
    }
    // 오늘 숙제(구조화): 완전히 빈 행은 조용히 제외, 일부만 채운 행은 안내
    const cleanedAssignments = assignments.filter(
      (item) => item.content.trim() || item.dueDate,
    );
    for (const item of cleanedAssignments) {
      if (!item.content.trim()) {
        failValidation("숙제 내용을 입력해주세요.");
        return;
      }
      if (!item.dueDate) {
        failValidation("숙제 완료일을 선택해주세요.");
        return;
      }
      if (classDate && item.dueDate <= classDate) {
        failValidation("숙제 완료일은 수업일 이후로 선택해주세요.");
        return;
      }
    }
    finalSavingRef.current = true; // final 저장 중 autosave tick 중단
    startTransition(async () => {
      const result = await saveDailyLogAction({
        dailyLogId: persistedLogIdRef.current ?? undefined,
        draftId: draftIdRef.current,
        classDate,
        groupId: group.id,
        title,
        defaultProgress,
        memo,
        homework,
        homeworkDueDate: homework.trim() ? homeworkDueDate : "",
        homeworkAssignments: cleanedAssignments.map(({ id, content, dueDate }) => ({
          id,
          content,
          dueDate,
        })),
        nextLessonPlan,
        nextPlanDate: nextLessonPlan.trim() ? nextPlanDate : "",
        taskContent,
        taskDate: taskContent.trim() ? taskDate : "",
        vocabTotal,
        reflectionGood,
        reflectionHard,
        reflectionNext,
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
            vocabMistakes: entry.vocabMistakes,
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

      if (result && "duplicate" in result && result.duplicate) {
        finalSavingRef.current = false;
        setShowSummary(false);
        setDuplicateExistingId(
          "existingLogId" in result && typeof result.existingLogId === "string"
            ? result.existingLogId
            : null,
        );
        setDuplicateOpen(true);
        return;
      }

      if (result && "success" in result && result.success) {
        // 저장 성공 — 이후 저장이 update가 되도록 정확한 일지 id를 기억한다
        persistedLogIdRef.current = result.dailyLogId;

        if (result.completed) {
          // [수업 기록 완료] (작성/수정 공통): 저장 결과의 id + classDate만으로
          // 방금 저장한 일지가 선택된 달력으로 이동한다. navigation 책임은 여기 한 곳뿐.
          // replace라 뒤로가기가 완료된 작성 화면으로 되돌아가지 않는다.
          // finalSavingRef는 그대로 둬서 전환 중 autosave가 끼어들지 않게 한다.
          initialSnapshotRef.current = JSON.stringify(formStateRef.current); // unsaved 경고 방지
          router.replace(
            `/daily-logs?month=${result.classDate.slice(0, 7)}&date=${result.classDate}&log=${result.dailyLogId}&saved=1`,
          );
          return;
        }

        // 임시 저장 성공 — 이동 없이 작성 화면 유지
        finalSavingRef.current = false;
        draftIdRef.current = null; // 서버가 autosave draft를 정리했음 — 다음 autosave는 새로 시작
        const snapshot = JSON.stringify(formStateRef.current);
        lastSavedSnapshotRef.current = snapshot; // 변경 없으면 autosave가 재저장하지 않게
        initialSnapshotRef.current = snapshot; // 뒤로가기 unsaved 경고 방지
        setDraftPrompt(false);
        setAutosave({ status: "saved", savedAtLabel: kstTimeLabel(new Date().toISOString()) });
        setDraftSavedNotice("임시 저장했어요. 목록에는 “작성 중”으로 표시돼요.");
        return;
      }

      // 저장 실패 — 요약 모달을 닫고 오류를 보이게 한다 (이동 없음, 입력값 유지)
      finalSavingRef.current = false;
      setShowSummary(false);
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
      {/* 상단 저장 액션 — 하단과 완전히 동일한 handler/pending 공유 (긴 폼에서
          아래까지 내려가지 않아도 저장 가능). 자동 임시저장 상태도 같은 줄에 표시 */}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {autosave.status !== "idle" ? (
          <span className="text-[11px]">
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
          </span>
        ) : null}
        <span className="flex flex-wrap items-center justify-end gap-2">
          <SaveActions
            isPending={isPending}
            onDraft={() => save("draft")}
            onFinal={() => setShowSummary(true)}
          />
        </span>
      </div>

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
                  if (!taskDateTouched && value) {
                    setTaskDate(nextClassDateAfter(scheduleDays, value) ?? "");
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
                  // fresh=1: 그룹을 바꾸려는 의도된 이동이라 draft resume redirect를 우회
                  <Link
                    href="/daily-logs/new?fresh=1"
                    className="shrink-0 text-xs text-[#5c4ca8] hover:underline"
                  >
                    변경
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 제목 (선택)</span>
            {/* 제목은 자유 입력이 source of truth. 교재 LIST는 그룹 교재명을 제목에
                한 번 삽입해주는 보조 버튼 — 이후 동기화/강제 변경 없음 (자유 수정 가능) */}
            <div className="flex flex-wrap items-start gap-2">
              <input
                ref={titleInputRef}
                aria-label="수업 제목"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-w-0 flex-1 basis-56 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                placeholder="Unit 3 본문 독해"
              />
              {textbooks.length > 0 ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setTextbookListOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={textbookListOpen}
                    className="flex min-h-[42px] items-center gap-1.5 rounded-2xl border border-[#e2d8f3] bg-[#f8f5fd] px-3 py-2 text-sm font-medium text-[#6652b9] transition hover:bg-[#f1ecfa]"
                  >
                    <BookOpen className="h-3.5 w-3.5" aria-hidden /> 교재 LIST
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {textbookListOpen ? (
                    <>
                      {/* 바깥 클릭으로 닫기 */}
                      <div
                        aria-hidden
                        className="fixed inset-0 z-30"
                        onClick={() => setTextbookListOpen(false)}
                      />
                      <div
                        role="listbox"
                        aria-label="교재 목록"
                        className="absolute right-0 z-40 mt-1 max-h-64 w-64 overflow-y-auto rounded-2xl border border-[#e8ddf3] bg-white p-1.5 shadow-[0_12px_32px_rgba(60,48,90,0.18)]"
                      >
                        {textbooks.map((book) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            key={book}
                            onClick={() => insertTextbookIntoTitle(book)}
                            className="block w-full truncate rounded-xl px-3 py-2 text-left text-sm text-[#3d3450] transition hover:bg-[#f5f1fb]"
                          >
                            {book}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

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
            <div className="block min-w-0">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <NotebookTabs className="h-3.5 w-3.5 text-[#6652b9]" /> 오늘 숙제
              </span>

              {/* 오늘 새로 내주는 숙제 — 숙제 N개, 각각 독립 완료일.
                  (지난 숙제를 해왔는지는 위 학생별 "숙제" 평가에서 — 서로 다른 기능)
                  Teacher Todo/캘린더 자동 생성 없음. draft 단계에서는 payload로만 유지. */}
              <div className="space-y-2">
                {assignments.map((item, index) => (
                  <div
                    key={item.key}
                    className="min-w-0 rounded-2xl border border-[#ece0db] bg-[#fffdfb] p-2.5"
                  >
                    {/* 내용 칸 아래에 완료일 카드가 오는 세로 배치 (화면 폭과 무관) */}
                    <div className="flex min-w-0 flex-col gap-2">
                      <textarea
                        value={item.content}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAssignments((prev) =>
                            prev.map((it) => (it.key === item.key ? { ...it, content: value } : it)),
                          );
                        }}
                        rows={2}
                        maxLength={500}
                        aria-label={`숙제 ${index + 1} 내용`}
                        placeholder={"백발백중 5과 문법 문제\n(여러 줄로 적을 수 있어요)"}
                        className="min-h-[58px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                      />
                      <div className="flex min-w-0 items-center justify-between gap-1.5">
                        <span className="flex min-h-[38px] min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-[#e2d8f3] bg-[#f8f5fd] px-2.5 text-xs font-medium text-[#6652b9]">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <input
                            type="date"
                            aria-label={`숙제 ${index + 1} 완료일`}
                            value={item.dueDate}
                            min={addDaysStr(classDate, 1)}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAssignments((prev) =>
                                prev.map((it) => (it.key === item.key ? { ...it, dueDate: value } : it)),
                              );
                            }}
                            className="w-full min-w-0 max-w-[140px] bg-transparent text-xs font-medium text-[#6652b9] outline-none"
                          />
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAssignments((prev) => prev.filter((it) => it.key !== item.key))
                          }
                          aria-label={`숙제 ${index + 1} 삭제`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#b5a29e] transition hover:bg-[#fdf4f1] hover:text-[#8f625f]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setAssignments((prev) => [
                      ...prev,
                      {
                        key: globalThis.crypto.randomUUID(),
                        // id를 추가 시점에 발급 — 첫 저장부터 이 id로 insert되므로
                        // 재저장/수정에도 row id가 안정적으로 유지된다 (idempotent sync)
                        id: globalThis.crypto.randomUUID(),
                        content: "",
                        // 기본 완료일 = 이 그룹의 다음 실제 수업일 (시간표 없으면 빈 값 — 직접 선택)
                        dueDate: nextClassDateAfter(scheduleDays, classDate) ?? "",
                      },
                    ])
                  }
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9c8f0] bg-white text-sm font-medium text-[#6652b9] transition hover:bg-[#faf7ff]"
                >
                  <Plus className="h-4 w-4" aria-hidden /> 숙제 추가
                </button>
                <p className="text-[11px] text-[#a79996]">
                  숙제마다 완료일을 다르게 정할 수 있어요. 기본값은 다음 수업일이에요.
                </p>
              </div>

              {/* legacy free-text 숙제 (이전 방식으로 저장된 일지만) — 데이터/Todo 연동 그대로 편집 */}
              {showLegacyHomework ? (
                <div className="mt-3">
                  <span className="mb-1.5 block text-xs font-medium text-[#8a7b77]">
                    기존 숙제 메모 (이전 방식)
                  </span>
                  <textarea
                    value={homework}
                    onChange={(event) => setHomework(event.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                    placeholder={"Workbook p.24~27 / Unit 3 단어 1~30"}
                  />
                  <span className="mt-2 flex min-h-[38px] w-fit max-w-full items-center gap-1.5 rounded-xl border border-[#e2d8f3] bg-[#f8f5fd] px-2.5 text-xs font-medium text-[#6652b9]">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="shrink-0">숙제 날짜</span>
                    <input
                      type="date"
                      aria-label="숙제 표시 날짜 선택 (선택 사항)"
                      value={homeworkDueDate}
                      min={addDaysStr(classDate, 1)}
                      onChange={(event) => setHomeworkDueDate(event.target.value)}
                      className="min-w-0 max-w-[140px] bg-transparent text-xs font-medium text-[#6652b9] outline-none"
                    />
                    {homeworkDueDate ? (
                      <button
                        type="button"
                        onClick={() => setHomeworkDueDate("")}
                        aria-label="숙제 날짜 지우기"
                        className="shrink-0 rounded-lg px-1 text-[#9b8bc9] transition hover:text-[#6652b9]"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>

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

              {/* 해야 할 일 — 다음 수업 계획(수업 내용)과 별개인 Teacher 작업.
                  [수업 기록 완료] 시 공용 Todo 1개로 연결 (임시저장/autosave는 Todo 생성 없음,
                  여러 줄을 적어도 하나의 할 일 — 줄 수만큼 쪼개지 않는다) */}
              <div className="mt-4 min-w-0">
                <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                  <CheckCheck className="h-3.5 w-3.5 text-[#5d4ba5]" /> 해야 할 일
                </span>
                <textarea
                  value={taskContent}
                  onChange={(event) => setTaskContent(event.target.value)}
                  rows={3}
                  className="w-full min-w-0 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                  placeholder={"백발백중 프린트 출력\n단어 시험지 준비"}
                />
                <span className="mt-2 flex min-h-[38px] w-fit max-w-full items-center gap-1.5 rounded-xl border border-[#e2d8f3] bg-[#f8f5fd] px-2.5 text-xs font-medium text-[#5d4ba5]">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="shrink-0">날짜</span>
                  <input
                    type="date"
                    aria-label="해야 할 일 날짜 선택"
                    value={taskDate}
                    min={classDate || undefined}
                    onChange={(event) => {
                      setTaskDate(event.target.value);
                      if (event.target.value) {
                        setTaskDateTouched(true);
                      }
                    }}
                    className="w-full min-w-0 max-w-[140px] bg-transparent text-xs font-medium text-[#5d4ba5] outline-none"
                  />
                </span>
                <p className="mt-1 text-[11px] text-[#a79996]">
                  수업 기록을 완료하면 오늘 할 일에 하나의 할 일로 등록돼요.
                </p>
              </div>
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
                    onClick={() => updateEntry(student.studentId, { attendance: "early_leave" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "early_leave"
                        ? "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <DoorOpen className="h-3.5 w-3.5" /> 조퇴
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
                    {/* 여러 줄 입력: Enter = 줄바꿈 (submit 아님 — 저장은 하단 버튼).
                        onChange에서 값 재작성 없음 — newline/IME 조합이 그대로 보존된다. */}
                    <textarea
                      value={entry.missedProgress}
                      onChange={(event) => updateEntry(student.studentId, { missedProgress: event.target.value })}
                      rows={4}
                      maxLength={1000}
                      className="min-h-[96px] w-full min-w-0 max-w-full rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#e3bcb4] placeholder:text-[#b5a29e]"
                      placeholder={
                        defaultProgress.trim()
                          ? `공통 진도: ${defaultProgress.trim()}`
                          : "관계대명사 주격 개념\nGrammar Inside p.42~45\n5과 단어시험"
                      }
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

                      {/* 틀린 단어 — draft autosave에는 payload로만 담기고 final 저장 시 rows 반영 */}
                      <VocabMistakeChips
                        studentName={student.name}
                        words={entry.vocabMistakes}
                        onChange={(next) => updateEntry(student.studentId, { vocabMistakes: next })}
                      />

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

                        {/* 약점 노트 — 공용 폼으로 즉시 저장 (학생 상세의 약점 노트에 모임) */}
                        <button
                          type="button"
                          onClick={() => {
                            setWeaknessError("");
                            setWeaknessOpenFor(student.studentId);
                          }}
                          className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#ecd9b4] bg-[#fdf8ec] px-3 py-1.5 text-xs font-medium text-[#8a6828] transition hover:bg-[#fdf3e4]"
                        >
                          📌 약점 기록 +
                        </button>
                        {weaknessSavedFor === student.studentId ? (
                          <span className="text-xs text-[#3d7f64]">약점을 기록했어요 ✓</span>
                        ) : null}

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

                      {weaknessOpenFor === student.studentId ? (
                        <WeaknessFormDialog
                          heading="약점 기록"
                          studentName={student.name}
                          defaultReviewDueDate={nextClassDateAfter(scheduleDays, classDate) ?? ""}
                          dueDateHint="다음 수업일로 제안했어요"
                          isPending={weaknessPending}
                          error={weaknessError}
                          onCancel={() => setWeaknessOpenFor(null)}
                          onSubmit={(values) => submitWeakness(student.studentId, values)}
                        />
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

      {/* 수업 회고 (강사 자기 성찰) — 전부 선택 입력. 기본 접힘, 값이 있으면 자동 펼침.
          "다음에 다르게 해볼 것"은 같은 반의 다음 일지 작성 화면에 지난 다짐으로 리마인드된다. */}
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setReflectionOpen((open) => !open)}
          aria-expanded={reflectionOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[#2b2323]">
            <Sparkles className="h-4 w-4 text-[#8a6fc9]" aria-hidden />
            오늘 수업 회고 (선택)
            <span className="text-xs font-normal text-[#8a7b77]">
              30초 돌아보기 — 쓰는 만큼 다음 수업이 좋아져요
            </span>
          </span>
          {reflectionOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-[#8a7b77]" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-[#8a7b77]" aria-hidden />
          )}
        </button>

        {previousReflection ? (
          <div className="mt-3 rounded-2xl border border-[#e8ddf3] bg-[#fbf8ff] px-3.5 py-2.5 text-sm text-[#5a4a80]">
            <span className="font-medium">
              지난 수업의 다짐 ({formatKoreanDate(previousReflection.classDate)})
            </span>
            <span className="mx-1.5 text-[#c0b3d8]">·</span>
            <span className="whitespace-pre-line">{previousReflection.reflectionNext}</span>
          </div>
        ) : null}

        {reflectionOpen ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#3e7d6b]">잘된 점</span>
              <textarea
                value={reflectionGood}
                onChange={(event) => setReflectionGood(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#dcebe2] bg-[#fbfdfc] px-3 py-2.5 text-sm outline-none focus:border-[#b7d8c6] placeholder:text-[#a79996]"
                placeholder="예) 문법 설명 전에 예문부터 보여주니 이해가 빨랐다"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#8a5d52]">아쉬웠던 점</span>
              <textarea
                value={reflectionHard}
                onChange={(event) => setReflectionHard(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#f0ded8] bg-[#fffcfa] px-3 py-2.5 text-sm outline-none focus:border-[#e2c4ba] placeholder:text-[#a79996]"
                placeholder="예) 단어시험 채점에 수업 시간을 너무 썼다"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#5c4ca8]">다음에 다르게 해볼 것</span>
              <textarea
                value={reflectionNext}
                onChange={(event) => setReflectionNext(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#e2d8f3] bg-[#fcfaff] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                placeholder="예) 채점은 짝 바꿔 하게 하고, 그 시간에 개별 질문 받기"
              />
            </label>
          </div>
        ) : null}
      </Card>

      {error ? (
        <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-3 text-sm text-[#7f5d57]">
          {error}
        </div>
      ) : null}

      {draftSavedNotice ? (
        <div className="rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-3 text-sm text-[#2f6d54]">
          {draftSavedNotice}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pb-8">
        <SaveActions
          isPending={isPending}
          onDraft={() => save("draft")}
          onFinal={() => setShowSummary(true)}
        />
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
              {`${formatKoreanDate(classDate)}에 이미 등록된 수업 일지가 있어요.\n같은 반의 수업 일지는 하루에 한 번만 등록할 수 있어요.${
                duplicateExistingId
                  ? "\n기존 일지를 이어서 작성해주세요 — 지금 화면의 내용은 자동 임시저장으로 보관해둘게요."
                  : ""
              }`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDuplicateOpen(false)}
              >
                닫기
              </Button>
              {duplicateExistingId ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    // 지금 화면 내용을 자동 임시저장으로 보관해 유실을 막은 뒤 기존 일지로 이동
                    // (자동 merge는 하지 않는다 — 두 내용은 각각 확인 가능)
                    try {
                      await autosaveDailyLogDraftAction({
                        draftId: draftIdRef.current,
                        dailyLogId: persistedLogIdRef.current,
                        groupId: group.id,
                        classDate,
                        payload: formStateRef.current,
                      });
                    } catch {
                      // 보관 실패 시에도 이동은 진행 — unsaved guard가 한 번 더 확인해준다
                    }
                    initialSnapshotRef.current = JSON.stringify(formStateRef.current);
                    setDuplicateOpen(false);
                    router.push(`/daily-logs/${duplicateExistingId}/edit`);
                  }}
                >
                  기존 일지 이어쓰기 →
                </Button>
              ) : null}
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
          reflectionFilled={Boolean(
            reflectionGood.trim() || reflectionHard.trim() || reflectionNext.trim(),
          )}
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
  reflectionFilled,
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
  reflectionFilled: boolean;
  students: DailyLogFormStudent[];
  entries: Record<string, EntryState>;
  isPending: boolean;
  onBack: () => void;
  onComplete: () => void;
}) {
  const counts = { present: 0, late: 0, early_leave: 0, absent: 0 };

  // 오늘 체크할 학생: 실제 attention 항목이 있는 학생만 (정상 학생은 나열하지 않음)
  const checkStudents: { name: string; items: string[] }[] = [];

  for (const student of students) {
    const entry = entries[student.studentId];
    counts[entry.attendance] += 1;

    const items: string[] = [];

    if (entry.attendance === "absent") {
      items.push(entry.needsMakeup ? "결석 · 보충 필요" : "결석");
    }
    if (entry.attendance === "early_leave") {
      items.push("조퇴");
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
    !reflectionFilled ? "오늘 수업 회고가 비어 있어요." : null,
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
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[#3d7f64]">출석 {counts.present}명</span>
              <span className="rounded-full bg-[#fdf3e4] px-2 py-1 text-[#94702f]">지각 {counts.late}명</span>
              <span className="rounded-full bg-[#f3eefc] px-2 py-1 text-[#614ea7]">조퇴 {counts.early_leave}명</span>
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
