// Daily Log 작성 완성도의 단일 소스 — 순수 함수.
//
// 소비처 두 곳이 같은 함수를 쓴다:
//   ① Daily Log 폼의 [수업 기록 완료] 요약 모달 (폼 state → 리마인더 문구)
//   ② Dashboard 수업 브리핑 카드의 "수업 마무리" 체크리스트 (저장된 일지 row → 항목 상태)
//
// Final Save(saveDailyLogAction + lib/validation/daily-log)에는 "내용 필수" 항목이 없다 — 검증은
// 날짜 짝(계획 날짜/숙제 완료일/할 일 날짜)과 형식(단어시험 총 문항 등)뿐이고, 학생 기록은 1명 이상이면 된다.
// 따라서 여기의 어떤 항목도 완료를 막지 않는다(blocking 없음). 상태는 세 가지:
//   done      입력됨
//   review    확인 권장 — 기존 요약 모달이 리마인더로 보여주던 것과 같은 성격 ("그래도 그대로 완료할 수 있어요")
//   optional  선택 항목 — 비어 있어도 안내하지 않는다
// 새 검증 규칙/문자열 heuristic을 만들지 않는다: 진도는 기존 mergeLegacyLessonContent + 구조화 섹션,
// 숙제는 저장된 homework(legacy 원문 또는 구조화 mirror), 온라인 복습은 nullable 3-state 그대로(null=미선택).

import { mergeLegacyLessonContent } from "@/lib/progress";
import type { AttendanceCounts } from "@/lib/attendance";
import { emptyAttendanceCounts } from "@/lib/attendance";
import type { AttendanceStatus, HomeworkStatus } from "@/lib/supabase/types";

// Daily Log 폼의 실제 섹션 anchor id — DailyLogSectionNav(DAILY_LOG_NAV_SECTIONS)와 같은 id 집합.
// 대시보드의 [빠진 항목 확인]은 이 id를 hash(#progress …)로 붙여 기존 anchor(scroll-mt-24)로 이동한다.
export type DailyLogSectionId = "progress" | "homework" | "attendance" | "next-plan";

export type ChecklistState = "done" | "review" | "optional";

export type ChecklistItemKey =
  | "attendance"
  | "progress"
  | "homework"
  | "evaluation"
  | "online_review"
  | "next_plan"
  | "tasks"
  | "reflection";

export type ChecklistItem = {
  key: ChecklistItemKey;
  label: string;
  state: ChecklistState;
  // 상태를 색이 아니라 문구로 전달 ("입력 완료", "2명 미입력", "비어 있어요 · 선택" …)
  detail: string;
  section: DailyLogSectionId;
};

// 완성도 판정 입력 — 저장된 일지(row)든 폼 state든 이 모양으로 줄여서 넘긴다.
export type DailyLogCompletenessSource = {
  studentRows: number; // 학생 기록 수 (Final Save 최소 조건: 1명 이상)
  attendanceCounts: AttendanceCounts;
  progressFilled: boolean;
  homeworkFilled: boolean;
  // 출석(결석 제외) 학생 중 평가 입력이 전혀 없는 수 — review-only
  evaluationMissing: number;
  // 출석(결석 제외) 학생 중 온라인 복습이 미선택(null)인 수 — review-only (null을 false로 바꾸지 않는다)
  onlineReviewUnselected: number;
  nextPlanFilled: boolean;
  taskCount: number;
  reflectionFilled: boolean;
};

export type LessonRowForCompleteness = {
  attendance: AttendanceStatus;
  homework_status: HomeworkStatus | null;
  online_review_completed: boolean | null;
  strengths: string | null;
  improvements: string | null;
  memo: string | null;
  focus_level: string | null;
  participation_level: string | null;
  question_level: string | null;
  kindness_level: string | null;
  effort_level: string | null;
};

export type PersistedLogForCompleteness = {
  default_progress: string | null;
  lesson_content: string | null;
  textbook_progress: { name: string; text: string }[] | null;
  school_progress: { name: string; text: string }[] | null;
  // 저장 시 legacy 원문 또는 구조화 숙제의 mirror가 기록된다 (비어 있으면 숙제 없음)
  homework: string | null;
  next_lesson_plan: string | null;
  textbook_plans: { name: string; text: string }[] | null;
  school_plans: { name: string; text: string }[] | null;
  tasks: { content: string }[] | null;
  task_content: string | null;
  reflection_good: string | null;
  reflection_hard: string | null;
  reflection_next: string | null;
  student_lesson_logs: LessonRowForCompleteness[];
};

function sectionsHaveText(sections: { text: string }[] | null | undefined) {
  return (sections ?? []).some((section) => section.text.trim().length > 0);
}

// 학생 평가 카드에 "무언가 입력했는가" — 숙제 확인/quick check 5종/강점·보완·메모 중 하나라도.
// (출결은 항상 값이 있으므로 평가 입력 여부의 근거가 되지 않는다)
export function lessonRowHasEvaluation(row: LessonRowForCompleteness) {
  return Boolean(
    row.homework_status ||
      row.focus_level ||
      row.participation_level ||
      row.question_level ||
      row.kindness_level ||
      row.effort_level ||
      row.strengths?.trim() ||
      row.improvements?.trim() ||
      row.memo?.trim(),
  );
}

// 저장된 일지 row(+학생 기록) → 완성도 입력. 진도/계획은 구조화 섹션 + legacy 원문 fallback(기존 semantics).
export function completenessFromPersistedLog(log: PersistedLogForCompleteness): DailyLogCompletenessSource {
  const rows = log.student_lesson_logs ?? [];
  const counts = emptyAttendanceCounts();
  for (const row of rows) {
    counts[row.attendance] += 1;
  }
  const attended = rows.filter((row) => row.attendance !== "absent");
  const taskCount =
    log.tasks && log.tasks.length > 0
      ? log.tasks.filter((task) => task.content.trim()).length
      : log.task_content?.trim()
        ? 1
        : 0;

  return {
    studentRows: rows.length,
    attendanceCounts: counts,
    progressFilled:
      mergeLegacyLessonContent(log.default_progress, log.lesson_content).trim().length > 0 ||
      sectionsHaveText(log.textbook_progress) ||
      sectionsHaveText(log.school_progress),
    homeworkFilled: (log.homework ?? "").trim().length > 0,
    evaluationMissing: attended.filter((row) => !lessonRowHasEvaluation(row)).length,
    onlineReviewUnselected: attended.filter((row) => row.online_review_completed === null).length,
    nextPlanFilled:
      (log.next_lesson_plan ?? "").trim().length > 0 ||
      sectionsHaveText(log.textbook_plans) ||
      sectionsHaveText(log.school_plans),
    taskCount,
    reflectionFilled: Boolean(
      log.reflection_good?.trim() || log.reflection_hard?.trim() || log.reflection_next?.trim(),
    ),
  };
}

function attendanceDetail(counts: AttendanceCounts) {
  const parts = [
    counts.present > 0 ? `출석 ${counts.present}` : "",
    counts.late > 0 ? `지각 ${counts.late}` : "",
    counts.early_leave > 0 ? `조퇴 ${counts.early_leave}` : "",
    counts.absent > 0 ? `결석 ${counts.absent}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `입력 완료 · ${parts.join(" · ")}` : "입력 완료";
}

// 체크리스트 — 순서가 곧 "첫 번째 빠진 항목"의 우선순위다 (출결 → 진도 → 숙제 → 학생 평가 → 온라인 복습 →
// 다음 수업 계획 → 해야 할 일 → 회고). 요약 모달의 리마인더 문구와 같은 표현을 쓴다.
export function buildDailyLogChecklist(source: DailyLogCompletenessSource): ChecklistItem[] {
  const hasStudents = source.studentRows > 0;
  return [
    {
      key: "attendance",
      label: "출결",
      state: hasStudents ? "done" : "review",
      detail: hasStudents ? attendanceDetail(source.attendanceCounts) : "미입력",
      section: "attendance",
    },
    {
      key: "progress",
      label: "진도",
      state: source.progressFilled ? "done" : "review",
      detail: source.progressFilled ? "입력 완료" : "입력된 진도가 없어요",
      section: "progress",
    },
    {
      key: "homework",
      label: "숙제",
      state: source.homeworkFilled ? "done" : "review",
      detail: source.homeworkFilled ? "입력 완료" : "비어 있어요 · 선택",
      section: "homework",
    },
    {
      key: "evaluation",
      label: "학생 평가",
      state: !hasStudents || source.evaluationMissing > 0 ? "review" : "done",
      detail: !hasStudents
        ? "미입력"
        : source.evaluationMissing > 0
          ? `${source.evaluationMissing}명 미입력 · 확인 권장`
          : "입력 완료",
      section: "attendance",
    },
    {
      key: "online_review",
      label: "온라인 복습",
      state: !hasStudents || source.onlineReviewUnselected > 0 ? "review" : "done",
      detail: !hasStudents
        ? "미선택"
        : source.onlineReviewUnselected > 0
          ? `${source.onlineReviewUnselected}명 미선택 · 확인 권장`
          : "선택 완료",
      section: "attendance",
    },
    {
      key: "next_plan",
      label: "다음 수업 계획",
      state: source.nextPlanFilled ? "done" : "review",
      detail: source.nextPlanFilled ? "입력 완료" : "비어 있어요 · 선택",
      section: "next-plan",
    },
    {
      key: "tasks",
      label: "해야 할 일",
      state: source.taskCount > 0 ? "done" : "optional",
      detail: source.taskCount > 0 ? `${source.taskCount}개` : "없음 · 선택",
      section: "next-plan",
    },
    {
      key: "reflection",
      label: "수업 회고",
      state: source.reflectionFilled ? "done" : "optional",
      detail: source.reflectionFilled ? "입력 완료" : "비어 있어요 · 선택",
      section: "next-plan",
    },
  ];
}

// [빠진 항목 확인]의 목적지 — 확인 권장(review) 항목 중 첫 번째의 섹션. 없으면 null(일지 상단).
export function firstMissingSection(items: readonly ChecklistItem[]): DailyLogSectionId | null {
  return items.find((item) => item.state === "review")?.section ?? null;
}

// [수업 기록 완료] 요약 모달의 리마인더 — 기존 문구 그대로 (숙제/다음 수업 계획/회고).
// 폼은 자기 state를 source로 줄여 같은 함수를 부른다 → 대시보드 체크리스트와 판정이 갈릴 수 없다.
export function completionReminders(
  source: Pick<DailyLogCompletenessSource, "homeworkFilled" | "nextPlanFilled" | "reflectionFilled">,
): string[] {
  return [
    !source.homeworkFilled ? "오늘 숙제가 비어 있어요." : null,
    !source.nextPlanFilled ? "다음 수업 계획이 비어 있어요." : null,
    !source.reflectionFilled ? "오늘 수업 회고가 비어 있어요." : null,
  ].filter((text): text is string => Boolean(text));
}
