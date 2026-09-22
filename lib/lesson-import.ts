// [지난 수업에서 가져오기]의 순수 helper — 날짜 기준(date-targeted) 후보 조립 + 현재 폼 기준 분류/적용.
//
// source는 같은 그룹의 "현재 폼 lesson_date(D)보다 이전" Finalized 일지들 중, 각 항목의 저장된/canonical
// 날짜가 D와 정확히 일치하는 것만이다 (서버 getLessonImportCandidates가 DB에서 exact filter — created_at/
// 문자열 라벨로 추측하지 않는다). "직전 Finalized 1건"만 보던 구조에서 벗어나며, 날짜가 없는 legacy 계획만
// 직전 Finalized fallback(secondary)으로 남긴다. 후보는 현재 폼 상태/모드와 비교해 4가지로만 분류한다:
//   importable   — 안전하게 가져올 수 있음 (현재 context 유효 + 비어 있음)
//   conflict     — 같은 context에 이미 다른 내용이 작성돼 있음 (자동 덮어쓰기 금지)
//   duplicate    — 같은 내용이 이미 있음 (재가져오기 방지 — 다시 추가하지 않는다)
//   incompatible — 현재 수업 구조(모드/대상 학교/교재/학생)와 맞지 않음 (자동 변환 금지)
// DB enum이 아니라 UI/판정 전용 derived type이다. 원본 일지는 어떤 경우에도 수정하지 않는다.
// 모드 판정은 PHASE 2/3과 동일한 resolveProgressMode 결과를 받아 쓴다 (별도 판단 로직 금지).

import { resolveDailyLogTaskDueDate } from "@/lib/daily-log-tasks";
import type { ManualProgressItem } from "@/lib/manual-progress";
import type { ProgressMode } from "@/lib/progress-mode";
import { isExamTargetStudent } from "@/lib/progress-mode";

export type ImportStatus = "importable" | "conflict" | "duplicate" | "incompatible";

// ── 후보 — stable source identity를 가진다 (array index key 금지, 문자열 동일성으로 서로 다른 항목을 지우지 않는다) ──

export type ImportPlanCandidate = {
  id: string; // `${sourceLogId}:${kind}:${name}` — 표시/선택 key
  sourceLogId: string;
  sourceLessonDate: string; // source 일지의 lesson_date (KST date-only)
  targetDate: string | null; // 저장된 daily_logs.next_plan_date (legacy fallback은 null)
  kind: "school" | "textbook" | "memo";
  name: string;
  text: string;
};

export type ImportHomeworkCandidate = {
  sourceId: string; // daily_log_homework_assignments.id
  sourceLogId: string;
  sourceLessonDate: string;
  dueDate: string; // 저장된 due_date (= canonical effective due date)
  content: string;
  textbook: string;
  school: string;
  assignedStudentId: string | null;
  assignedStudentName: string | null;
};

export type ImportTaskCandidate = {
  id: string; // `${sourceLogId}:${taskId}`
  sourceLogId: string;
  sourceLessonDate: string;
  taskId: string; // tasks jsonb의 stable id ("legacy" = 단일 task_* 컬럼)
  dueDate: string; // canonical effective date (resolveDailyLogTaskDueDate)
  content: string;
  textbook: string;
  school: string;
};

export type LessonImportCandidates = {
  lessonDate: string;
  // D를 정확히 target하는 항목들 — source lesson_date ASC, 같은 일지 안에서는 저장 순서
  plans: ImportPlanCandidate[];
  homework: ImportHomeworkCandidate[];
  tasks: ImportTaskCandidate[];
  // dated 계획 후보가 하나도 없을 때만 — 직전 Finalized의 "날짜 미지정" 계획 (secondary, 기존 fallback 호환)
  legacy: { sourceLogId: string; sourceLessonDate: string; plans: ImportPlanCandidate[] } | null;
};

export function emptyLessonImportCandidates(lessonDate: string): LessonImportCandidates {
  return { lessonDate, plans: [], homework: [], tasks: [], legacy: null };
}

// ── 서버 row → 후보 (순수 변환 — 쿼리 결과를 받아 정렬/필터만 한다) ──

export type PlanSourceRow = {
  id: string;
  class_date: string;
  next_plan_date: string | null;
  next_lesson_plan: string | null;
  school_plans: { name: string; text: string }[] | null;
  textbook_plans: { name: string; text: string }[] | null;
};

const LEGACY_PLAN_NAME = "지난 수업 계획 (자유 입력)";

// 한 일지의 계획 항목들 — 구조화(school/textbook)가 하나도 없을 때만 raw text를 legacy(memo)로 취급
// (mirror 텍스트를 raw로 오인하지 않게). 문자열에서 학교/교재를 추론하지 않는다.
export function planCandidatesFromRow(row: PlanSourceRow): ImportPlanCandidate[] {
  const base = {
    sourceLogId: row.id,
    sourceLessonDate: row.class_date,
    targetDate: row.next_plan_date,
  };
  const school = (row.school_plans ?? [])
    .filter((plan) => plan.text?.trim())
    .map((plan) => ({ ...base, id: `${row.id}:school:${plan.name}`, kind: "school" as const, name: plan.name, text: plan.text }));
  const textbook = (row.textbook_plans ?? [])
    .filter((plan) => plan.text?.trim())
    .map((plan) => ({ ...base, id: `${row.id}:textbook:${plan.name}`, kind: "textbook" as const, name: plan.name, text: plan.text }));
  if (school.length === 0 && textbook.length === 0 && (row.next_lesson_plan ?? "").trim()) {
    return [{ ...base, id: `${row.id}:memo`, kind: "memo", name: LEGACY_PLAN_NAME, text: row.next_lesson_plan ?? "" }];
  }
  return [...school, ...textbook];
}

function byLessonDateAsc<T extends { sourceLessonDate: string }>(a: T, b: T) {
  return a.sourceLessonDate.localeCompare(b.sourceLessonDate);
}

// D를 target으로 저장한(next_plan_date = D) 과거 Finalized 일지들의 계획 — 방어적으로 다시 확인한다
// (source.lesson_date < D, target = D). 정렬: source lesson_date ASC, 같은 일지 안에서는 저장 순서.
export function datedPlanCandidates(rows: readonly PlanSourceRow[], lessonDate: string): ImportPlanCandidate[] {
  return [...rows]
    .filter((row) => row.next_plan_date === lessonDate && row.class_date < lessonDate)
    .sort((a, b) => a.class_date.localeCompare(b.class_date))
    .flatMap(planCandidatesFromRow);
}

// legacy fallback — dated 후보가 전혀 없고, 직전 Finalized에 "날짜 미지정"(next_plan_date null) 계획이 있을 때만.
// 날짜가 명시됐는데 D와 다른 계획은 fallback으로도 가져오지 않는다 (dated mismatch 우회 금지).
export function legacyPlanFallback(
  previous: PlanSourceRow | null,
  hasDatedPlans: boolean,
  lessonDate: string,
): LessonImportCandidates["legacy"] {
  if (hasDatedPlans || !previous || previous.next_plan_date !== null || !(previous.class_date < lessonDate)) {
    return null;
  }
  const plans = planCandidatesFromRow(previous);
  return plans.length > 0 ? { sourceLogId: previous.id, sourceLessonDate: previous.class_date, plans } : null;
}

export type HomeworkSourceRow = {
  id: string;
  content: string;
  textbook: string | null;
  school: string | null;
  assigned_student_id: string | null;
  sort_order: number | null;
  due_date: string;
  daily_log: { id: string; class_date: string; group_id: string; status: string } | null;
  assigned_student?: { id: string; name: string } | { id: string; name: string }[] | null;
};

// 숙제 후보 — 저장된 due_date(= "언제까지 해야 하는가"의 canonical 값)가 D인 과거 Finalized 숙제.
// 서버가 inner join으로 이미 걸렀지만 그룹/상태/과거 조건을 다시 확인한다 (다른 그룹 leak 금지).
export function homeworkCandidatesFromRows(
  rows: readonly HomeworkSourceRow[],
  groupId: string,
  lessonDate: string,
): ImportHomeworkCandidate[] {
  return rows
    .filter(
      (row) =>
        row.content?.trim() &&
        row.due_date === lessonDate &&
        row.daily_log &&
        row.daily_log.group_id === groupId &&
        row.daily_log.status === "completed" &&
        row.daily_log.class_date < lessonDate,
    )
    .map((row) => {
      const linked = Array.isArray(row.assigned_student) ? row.assigned_student[0] : row.assigned_student;
      return {
        candidate: {
          sourceId: row.id,
          sourceLogId: row.daily_log!.id,
          sourceLessonDate: row.daily_log!.class_date,
          dueDate: row.due_date,
          content: row.content,
          textbook: row.textbook ?? "",
          school: row.school ?? "",
          assignedStudentId: row.assigned_student_id,
          assignedStudentName: linked?.name ?? null,
        },
        sortOrder: row.sort_order ?? 0,
      };
    })
    .sort((a, b) => byLessonDateAsc(a.candidate, b.candidate) || a.sortOrder - b.sortOrder)
    .map((entry) => entry.candidate);
}

export type TaskSourceRow = {
  id: string;
  class_date: string;
  tasks: { id?: string; textbook?: string | null; school?: string | null; content?: string; dueDate?: string | null }[] | null;
  task_content: string | null;
  task_due_date: string | null;
  task_textbook: string | null;
};

// 해야 할 일 후보 — canonical effective date(resolveDailyLogTaskDueDate: 명시 날짜, 없으면 수업일+1)가 D인 항목.
// tasks jsonb가 canonical이고, null이면 legacy 단일 task_* 컬럼을 항목 1개("legacy")로 본다 (Todo id 규칙과 동일).
export function taskCandidatesFromRows(rows: readonly TaskSourceRow[], lessonDate: string): ImportTaskCandidate[] {
  const seen = new Set<string>();
  const out: { candidate: ImportTaskCandidate; order: number }[] = [];
  for (const row of rows) {
    if (seen.has(row.id) || !(row.class_date < lessonDate)) {
      continue;
    }
    seen.add(row.id);
    const items =
      row.tasks && row.tasks.length > 0
        ? row.tasks
        : row.task_content?.trim()
          ? [{ id: "legacy", textbook: row.task_textbook, school: null, content: row.task_content, dueDate: row.task_due_date }]
          : [];
    items.forEach((item, index) => {
      const content = (item.content ?? "").trim();
      if (!content) {
        return;
      }
      const dueDate = resolveDailyLogTaskDueDate(item.dueDate || null, row.class_date);
      if (dueDate !== lessonDate) {
        return;
      }
      const taskId = item.id || `index-${index}`;
      out.push({
        candidate: {
          id: `${row.id}:${taskId}`,
          sourceLogId: row.id,
          sourceLessonDate: row.class_date,
          taskId,
          dueDate,
          content: item.content ?? "",
          textbook: item.textbook ?? "",
          school: item.school ?? "",
        },
        order: index,
      });
    });
  }
  return out
    .sort((a, b) => byLessonDateAsc(a.candidate, b.candidate) || a.order - b.order)
    .map((entry) => entry.candidate);
}

// ── 현재 폼 기준 분류 ──

export type ClassifiedPlan = ImportPlanCandidate & {
  status: ImportStatus;
  reason: string;
};

const REASONS = {
  examOff: "시험 대비가 꺼져 있어 학교 진도로 가져올 수 없어요.",
  notTarget: "현재 시험 대상 학교가 아니어서 제외돼요.",
  notMemberSchool: "현재 이 반 학생의 학교가 아니어서 제외돼요.",
  legacyTextbook: "학교별 시험 진도 방식이라 교재 진도로 가져올 수 없어요.",
  notRegularTextbook: "현재 등록된 일반 교재가 아니어서 가져올 수 없어요.",
  noRegularStudents: "일반 수업 학생이 없어 교재 진도로 가져올 수 없어요.",
  conflict: "이미 오늘 진도가 작성되어 있어요.",
  duplicate: "이미 같은 내용이 있어요.",
  memoConflict: "기타 진도 메모가 이미 작성되어 있어요.",
  hwStudent: "현재 수업 대상 학생이 아니어서 가져오지 않아요.",
  hwConflict: "이미 같은 숙제가 있어요.",
  taskDuplicate: "이미 같은 할 일이 있어요.",
} as const;

// 진도 텍스트 필드의 중복 판정 — 같은 내용이 통째로(또는 이미 병합된 블록으로) 들어 있으면 duplicate.
// 진도 필드는 stable id가 없는 자유 텍스트라 내용 기준으로만 볼 수 있다 (같은 source를 두 번 가져와도 재추가 없음).
function contentStatus(current: string, text: string): { status: ImportStatus; reason: string } {
  const cur = current.trim();
  const candidate = text.trim();
  if (!cur) {
    return { status: "importable", reason: "" };
  }
  if (cur === candidate || cur.includes(candidate)) {
    return { status: "duplicate", reason: REASONS.duplicate };
  }
  return { status: "conflict", reason: REASONS.conflict };
}

// 지난 "다음 수업 계획" 항목들 → 오늘 진도 후보 분류.
// school↔textbook 변환은 어떤 방향으로도 하지 않는다 (저장된 structured context 그대로).
export function classifyPlanImports(input: {
  mode: ProgressMode;
  plans: readonly ImportPlanCandidate[];
  activeTargetSchools: readonly string[];
  memberSchools: readonly string[]; // legacy_exam 모드의 학교 입력 대상 (현재 학생 학교)
  regularTextbooks: readonly string[]; // 현재 그룹 일반 교재 (시험 대비용 교재 아님)
  canAddRegular: boolean; // mixed에서 일반 수업 학생 존재 여부
  currentSchoolText: Readonly<Record<string, string>>;
  currentTextbookText: Readonly<Record<string, string>>; // OFF는 map, mixed는 manual item 파생
  currentMemo: string; // 기타 진도 메모 (legacy raw의 canonical destination)
}): ClassifiedPlan[] {
  return input.plans
    .filter((plan) => plan.text.trim())
    .map((plan) => {
      if (plan.kind === "school") {
        if (input.mode === "regular") {
          return { ...plan, status: "incompatible" as const, reason: REASONS.examOff };
        }
        if (input.mode === "mixed" && !input.activeTargetSchools.includes(plan.name)) {
          return { ...plan, status: "incompatible" as const, reason: REASONS.notTarget };
        }
        if (input.mode === "legacy_exam" && !input.memberSchools.includes(plan.name)) {
          return { ...plan, status: "incompatible" as const, reason: REASONS.notMemberSchool };
        }
        return { ...plan, ...contentStatus(input.currentSchoolText[plan.name] ?? "", plan.text) };
      }
      if (plan.kind === "textbook") {
        if (input.mode === "legacy_exam") {
          return { ...plan, status: "incompatible" as const, reason: REASONS.legacyTextbook };
        }
        if (!input.regularTextbooks.includes(plan.name)) {
          return { ...plan, status: "incompatible" as const, reason: REASONS.notRegularTextbook };
        }
        if (input.mode === "mixed" && !input.canAddRegular && !(plan.name in input.currentTextbookText)) {
          return { ...plan, status: "incompatible" as const, reason: REASONS.noRegularStudents };
        }
        return { ...plan, ...contentStatus(input.currentTextbookText[plan.name] ?? "", plan.text) };
      }
      // legacy raw 계획 — 기존 canonical free-text destination(기타 진도 메모) 기준
      const memo = contentStatus(input.currentMemo, plan.text);
      return {
        ...plan,
        status: memo.status,
        reason: memo.status === "conflict" ? REASONS.memoConflict : memo.reason,
      };
    });
}

// 같은 이름(교재/학교)에 여러 source의 계획이 있을 때 — 기존 텍스트 뒤에 줄바꿈으로 이어 붙인다
// (전체 교체 금지). 이미 들어 있는 블록은 다시 붙이지 않는다.
export function mergeImportedPlanText(current: string, texts: readonly string[]): string {
  let merged = current.trim();
  for (const text of texts) {
    const block = text.trim();
    if (!block || merged.includes(block)) {
      continue;
    }
    merged = merged ? `${merged}\n${block}` : block;
  }
  return merged;
}

export type ClassifiedHomework = ImportHomeworkCandidate & {
  status: ImportStatus;
  reason: string;
};

// 지난 숙제 복사 후보 분류 — NEW 항목으로만 복사한다 (원본 id/완료/기한 미복사).
export function classifyHomeworkImports(input: {
  mode: ProgressMode;
  entries: readonly ImportHomeworkCandidate[];
  activeTargetSchools: readonly string[];
  memberSchools: readonly string[];
  regularTextbooks: readonly string[];
  targetSchools: readonly string[]; // 저장된 시험 대상 (학생 분류용)
  students: readonly { studentId: string; name: string; school?: string | null }[];
  existing: readonly {
    content: string;
    school: string;
    textbook: string;
    assignedStudentId: string;
  }[];
}): ClassifiedHomework[] {
  return input.entries
    .filter((entry) => entry.content.trim())
    .map((entry) => {
      const school = entry.school.trim();
      const textbook = entry.textbook.trim();

      // context 유효성 (school↔textbook 변환/공통 강등 금지)
      if (school) {
        if (input.mode === "regular") {
          return { ...entry, status: "incompatible" as const, reason: REASONS.examOff };
        }
        if (input.mode === "mixed" && !input.activeTargetSchools.includes(school)) {
          return { ...entry, status: "incompatible" as const, reason: REASONS.notTarget };
        }
        if (input.mode === "legacy_exam" && !input.memberSchools.includes(school)) {
          return { ...entry, status: "incompatible" as const, reason: REASONS.notMemberSchool };
        }
      } else if (textbook && !input.regularTextbooks.includes(textbook)) {
        return { ...entry, status: "incompatible" as const, reason: REASONS.notRegularTextbook };
      }

      // 대상 학생 — 이탈/학교 불일치면 자동 공통 변환 없이 제외 (다른 학생에게 leak 금지)
      if (entry.assignedStudentId) {
        const student = input.students.find((item) => item.studentId === entry.assignedStudentId);
        const validStudent =
          student &&
          (school
            ? (student.school?.trim() ?? "") === school
            : input.mode === "mixed"
              ? !isExamTargetStudent(student.school, input.targetSchools)
              : true);
        if (!validStudent) {
          return { ...entry, status: "incompatible" as const, reason: REASONS.hwStudent };
        }
      }

      const dup = input.existing.some(
        (item) =>
          item.content.trim() === entry.content.trim() &&
          item.school.trim() === school &&
          item.textbook.trim() === textbook &&
          (item.assignedStudentId || "") === (entry.assignedStudentId ?? ""),
      );
      if (dup) {
        return { ...entry, status: "duplicate" as const, reason: REASONS.hwConflict };
      }
      return { ...entry, status: "importable" as const, reason: "" };
    });
}

export type ClassifiedTask = ImportTaskCandidate & {
  status: ImportStatus;
  reason: string;
};

// 지난 해야 할 일 복사 후보 분류 — 복사 시점 Todo 생성 0 (Final Save의 기존 sync만).
export function classifyTaskImports(input: {
  mode: ProgressMode;
  entries: readonly ImportTaskCandidate[];
  activeTargetSchools: readonly string[];
  memberSchools: readonly string[];
  regularTextbooks: readonly string[];
  existing: readonly { content: string; school: string; textbook: string }[];
}): ClassifiedTask[] {
  return input.entries
    .filter((entry) => entry.content.trim())
    .map((entry) => {
      const school = entry.school.trim();
      const textbook = entry.textbook.trim();
      if (school) {
        if (input.mode === "regular") {
          return { ...entry, status: "incompatible" as const, reason: REASONS.examOff };
        }
        if (input.mode === "mixed" && !input.activeTargetSchools.includes(school)) {
          return { ...entry, status: "incompatible" as const, reason: REASONS.notTarget };
        }
        if (input.mode === "legacy_exam" && !input.memberSchools.includes(school)) {
          return { ...entry, status: "incompatible" as const, reason: REASONS.notMemberSchool };
        }
      } else if (textbook && !input.regularTextbooks.includes(textbook)) {
        return { ...entry, status: "incompatible" as const, reason: REASONS.notRegularTextbook };
      }
      const dup = input.existing.some(
        (item) =>
          item.content.trim() === entry.content.trim() &&
          item.school.trim() === school &&
          item.textbook.trim() === textbook,
      );
      if (dup) {
        return { ...entry, status: "duplicate" as const, reason: REASONS.taskDuplicate };
      }
      return { ...entry, status: "importable" as const, reason: "" };
    });
}

// mixed 수동 교재 진도에 계획 텍스트 반영 — 기존 item이 있으면 id를 유지한 채 내용만 채우고
// (IME/remount 보호), 없으면 수동 추가 버튼과 같은 shape의 새 item을 만든다.
export function applyTextbookPlanToManualProgress(
  items: readonly ManualProgressItem[],
  name: string,
  text: string,
): ManualProgressItem[] {
  const existing = items.find((item) => item.name === name);
  if (existing) {
    return items.map((item) => (item.id === existing.id ? { ...item, text } : item));
  }
  return [...items, { id: globalThis.crypto.randomUUID(), name, text }];
}
