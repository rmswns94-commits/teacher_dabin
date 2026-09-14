// 편의성 PHASE 3 — "지난 수업에서 가져오기"의 순수 분류/적용 helper.
// source는 같은 그룹의 "현재 폼 lesson_date보다 이전" 최신 Finalized 일지 하나뿐이고
// (resolver는 서버 getPreviousLessonImportSource — lesson_date 기준, created_at 아님),
// 여기서는 그 후보들을 현재 폼 상태/모드와 비교해 4가지로만 분류한다:
//   importable   — 안전하게 가져올 수 있음 (현재 context 유효 + 비어 있음)
//   conflict     — 같은 context에 이미 다른 내용이 작성돼 있음 (자동 덮어쓰기 금지)
//   duplicate    — 같은 내용이 이미 있음 (재가져오기 방지 — 다시 추가하지 않는다)
//   incompatible — 현재 수업 구조(모드/대상 학교/교재/학생)와 맞지 않음 (자동 변환 금지)
// DB enum이 아니라 UI/판정 전용 derived type이다. 원본 일지는 어떤 경우에도 수정하지 않는다.
// 모드 판정은 PHASE 2/3과 동일한 resolveProgressMode 결과를 받아 쓴다 (별도 판단 로직 금지).

import type { ProgressMode } from "@/lib/progress-mode";
import { isExamTargetStudent } from "@/lib/progress-mode";
import type { ManualProgressItem } from "@/lib/manual-progress";

export type ImportStatus = "importable" | "conflict" | "duplicate" | "incompatible";

export type PreviousLessonImportSource = {
  id: string;
  classDate: string;
  schoolPlans: { name: string; text: string }[];
  textbookPlans: { name: string; text: string }[];
  // 구조화 계획이 하나도 없을 때만 남는 legacy free-text (구조 추론/파싱 금지 — 기타 메모로만)
  legacyPlanText: string;
  homework: {
    sourceId: string;
    content: string;
    textbook: string;
    school: string;
    assignedStudentId: string | null;
    assignedStudentName: string | null;
  }[];
  tasks: { content: string; textbook: string; school: string }[];
};

export type ClassifiedPlan = {
  kind: "school" | "textbook" | "memo";
  name: string;
  text: string;
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
  contextInvalid: "현재 수업 구조와 맞지 않아 자동으로 가져오지 않아요.",
} as const;

// 지난 "다음 수업 계획" 항목들 → 오늘 진도 후보 분류.
// school↔textbook 변환은 어떤 방향으로도 하지 않는다.
export function classifyPlanImports(input: {
  mode: ProgressMode;
  source: Pick<PreviousLessonImportSource, "schoolPlans" | "textbookPlans" | "legacyPlanText">;
  activeTargetSchools: readonly string[];
  memberSchools: readonly string[]; // legacy_exam 모드의 학교 입력 대상 (현재 학생 학교)
  regularTextbooks: readonly string[]; // 현재 그룹 일반 교재 (시험 대비용 교재 아님)
  canAddRegular: boolean; // mixed에서 일반 수업 학생 존재 여부
  currentSchoolText: Readonly<Record<string, string>>;
  currentTextbookText: Readonly<Record<string, string>>; // OFF는 map, mixed는 manual item 파생
  currentMemo: string; // 기타 진도 메모 (legacy raw의 canonical destination)
}): ClassifiedPlan[] {
  const out: ClassifiedPlan[] = [];

  const contentStatus = (current: string, text: string): { status: ImportStatus; reason: string } => {
    const cur = current.trim();
    if (!cur) {
      return { status: "importable", reason: "" };
    }
    if (cur === text.trim()) {
      return { status: "duplicate", reason: REASONS.duplicate };
    }
    return { status: "conflict", reason: REASONS.conflict };
  };

  for (const plan of input.source.schoolPlans) {
    if (!plan.text.trim()) {
      continue;
    }
    let status: ImportStatus = "importable";
    let reason = "";
    if (input.mode === "regular") {
      status = "incompatible";
      reason = REASONS.examOff;
    } else if (input.mode === "mixed" && !input.activeTargetSchools.includes(plan.name)) {
      status = "incompatible";
      reason = REASONS.notTarget;
    } else if (input.mode === "legacy_exam" && !input.memberSchools.includes(plan.name)) {
      status = "incompatible";
      reason = REASONS.notMemberSchool;
    } else {
      ({ status, reason } = contentStatus(input.currentSchoolText[plan.name] ?? "", plan.text));
    }
    out.push({ kind: "school", name: plan.name, text: plan.text, status, reason });
  }

  for (const plan of input.source.textbookPlans) {
    if (!plan.text.trim()) {
      continue;
    }
    let status: ImportStatus = "importable";
    let reason = "";
    if (input.mode === "legacy_exam") {
      status = "incompatible";
      reason = REASONS.legacyTextbook;
    } else if (!input.regularTextbooks.includes(plan.name)) {
      status = "incompatible";
      reason = REASONS.notRegularTextbook;
    } else if (
      input.mode === "mixed" &&
      !input.canAddRegular &&
      !(plan.name in input.currentTextbookText)
    ) {
      status = "incompatible";
      reason = REASONS.noRegularStudents;
    } else {
      ({ status, reason } = contentStatus(input.currentTextbookText[plan.name] ?? "", plan.text));
    }
    out.push({ kind: "textbook", name: plan.name, text: plan.text, status, reason });
  }

  // legacy raw 계획 — 구조화가 전혀 없을 때만. 문자열에서 학교/교재를 추론하지 않고
  // 기존 canonical free-text destination(기타 진도 메모)이 비어 있을 때만 통째로 가져온다.
  if (input.source.legacyPlanText.trim()) {
    const cur = input.currentMemo.trim();
    const text = input.source.legacyPlanText;
    const status: ImportStatus = !cur
      ? "importable"
      : cur === text.trim()
        ? "duplicate"
        : "conflict";
    out.push({
      kind: "memo",
      name: "지난 수업 계획 (자유 입력)",
      text,
      status,
      reason: status === "conflict" ? REASONS.memoConflict : status === "duplicate" ? REASONS.duplicate : "",
    });
  }

  return out;
}

export type ClassifiedHomework = PreviousLessonImportSource["homework"][number] & {
  status: ImportStatus;
  reason: string;
};

// 지난 숙제 복사 후보 분류 — NEW 항목으로만 복사한다 (원본 id/완료/기한 미복사).
export function classifyHomeworkImports(input: {
  mode: ProgressMode;
  entries: PreviousLessonImportSource["homework"];
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

      // 대상 학생 — 이탈/학교 불일치면 자동 공통 변환 없이 제외
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

export type ClassifiedTask = PreviousLessonImportSource["tasks"][number] & {
  status: ImportStatus;
  reason: string;
};

// 지난 해야 할 일 복사 후보 분류 — 복사 시점 Todo 생성 0 (Final Save의 기존 sync만).
export function classifyTaskImports(input: {
  mode: ProgressMode;
  entries: PreviousLessonImportSource["tasks"];
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
