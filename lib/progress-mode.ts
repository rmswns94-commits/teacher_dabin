// PHASE 2 — Daily Log 혼합 진도의 canonical resolver.
// 그룹의 진도 모드는 오직 이 순서로 판정한다 (STEP 37의 조건 순서가 규약):
//   1) is_exam_period OFF      → "regular"      (기존 교재별 진도 — 저장된 target은 무시)
//   2) ON + target 배열        → "mixed"        (시험 대상 scope별 + 일반 교재별 공존)
//   3) ON + target null        → "legacy_exam"  (PHASE 1 이전 그룹 — 기존 전체 학교별 방식 유지)
// legacy 그룹을 자동으로 mixed로 변환하지 않는다 (설정은 그룹 상세에서 Teacher가 직접).
//
// SCHOOL+GRADE SCOPE: 시험 대비의 canonical scope는 "학교 + 학년"(ExamTarget)이다.
// 학생 분류의 유일한 소스는 "그룹에 저장된 시험 대상 scope 설정"이며, 매칭은
// 학교 trim 정확 일치 + 학년 enum 정확 일치만 허용한다 (fuzzy/추론 금지).
// legacy target(grade null)은 "그 학교 전 학년" 의미로만 읽는다 — 자동 학년 부여 금지.
// 학교 미등록 학생은 어떤 target과도 매칭될 수 없으므로 항상 일반 수업(regular) 측이다.

import { compareExamTargets, targetMatchesStudent, type ExamTarget } from "@/lib/school-scope";
import {
  buildTextbookSectionsText,
  formatTextbookLinked,
  joinDerivedText,
  sectionDisplayName,
  type ContextSection,
  type TextbookSection,
} from "@/lib/textbooks";

export type ProgressMode = "regular" | "mixed" | "legacy_exam";

export function resolveProgressMode(
  isExamPeriod: boolean,
  examTargets: readonly ExamTarget[] | null | undefined,
): ProgressMode {
  if (!isExamPeriod) {
    return "regular";
  }
  if (Array.isArray(examTargets)) {
    return "mixed";
  }
  return "legacy_exam";
}

type ScopedStudent = { school?: string | null; grade?: string | null };

// 학생 1명이 시험 대상인지 — 학교+학년 정확 일치 (legacy target은 학교만).
export function isExamTargetStudent(
  student: ScopedStudent,
  targets: readonly ExamTarget[],
): boolean {
  return targets.some((target) => targetMatchesStudent(target, student));
}

// 현재 그룹 학생들을 시험/일반 두 집합으로 분류 (파생 계산 — 저장하지 않는다)
export function classifyStudentsByExamTarget<T extends ScopedStudent>(
  students: readonly T[],
  targets: readonly ExamTarget[],
): { examStudents: T[]; regularStudents: T[] } {
  const examStudents: T[] = [];
  const regularStudents: T[] = [];
  for (const student of students) {
    if (isExamTargetStudent(student, targets)) {
      examStudents.push(student);
    } else {
      regularStudents.push(student);
    }
  }
  return { examStudents, regularStudents };
}

// 신규 일지의 시험 진도 입력에 표시할 scope = 저장된 target 중 "현재 매칭 학생이 있는" 것만.
// 학생 0명인 stale target은 입력에서 제외된다 (저장된 설정 자체는 삭제하지 않는다 —
// 관리 UI는 그룹 상세). 정렬: 학교 가나다 → 전체(legacy) → 학년 순.
export function activeTargetScopes(
  targets: readonly ExamTarget[],
  students: readonly ScopedStudent[],
): ExamTarget[] {
  return targets
    .filter((target) => students.some((student) => targetMatchesStudent(target, student)))
    .slice()
    .sort(compareExamTargets);
}

// 한 scope의 현재 학생만 — 학교 trim 정확 일치 + 학년 일치(legacy는 전 학년)
export function studentsOfScope<T extends ScopedStudent>(
  students: readonly T[],
  scope: ExamTarget,
): T[] {
  return students.filter((student) => targetMatchesStudent(scope, student));
}

// PHASE 3 — mixed 모드에서 숙제/할 일 항목이 속하는 구획 판정.
// 저장 필드가 identity: school이 있으면 시험 측, textbook이 있으면 일반 측
// (과거 draft/기록의 비대상 학교도 시험 측에 보존 표시 — 자동 변환/삭제 없음).
// 명시 section(작성 중 클라이언트 상태/draft 전용 — DB에는 저장하지 않는다)이 있으면 우선.
// 둘 다 비어 있으면: 대상 학생이 일반 학생이면 일반 측, 아니면 기존(legacy) 규칙과
// 동일하게 시험 측 — 애매한 항목이 사라지지 않고 항상 어느 한 구획에 보인다.
export function mixedItemSection(
  item: {
    school?: string | null;
    textbook?: string | null;
    section?: "exam" | "regular" | null;
    assignedStudentId?: string | null;
  },
  regularStudentIds: ReadonlySet<string>,
): "exam" | "regular" {
  if (item.section === "exam" || item.section === "regular") {
    return item.section;
  }
  if (item.school?.trim()) {
    return "exam";
  }
  if (item.textbook?.trim()) {
    return "regular";
  }
  if (item.assignedStudentId && regularStudentIds.has(item.assignedStudentId)) {
    return "regular";
  }
  return "exam";
}

// 학생 1명의 "자기 몫" 학교 진도 섹션 찾기 — 자기 (학교, 학년) 섹션이 우선이고,
// 없으면 같은 학교의 legacy(전체, grade 없음) 섹션으로 fallback한다.
// 다른 학년의 섹션은 절대 돌려주지 않는다 (교차 적용 방지의 핵심).
export function sectionForStudent(
  sections: readonly ContextSection[],
  student: ScopedStudent,
): ContextSection | null {
  const school = student.school?.trim();
  if (!school) {
    return null;
  }
  const exact = sections.find(
    (section) =>
      section.name.trim() === school && (section.grade ?? null) === (student.grade ?? null),
  );
  if (exact) {
    return exact;
  }
  return sections.find((section) => section.name.trim() === school && !section.grade) ?? null;
}

// Mixed Mode에서 학생 1명에게 적용/스냅샷할 진도 후보 — 교차 적용 방지가 목적.
//   시험 학생 → 자기 (학교, 학년) 진도만 (+ 기타 메모) — 같은 학교 다른 학년 진도 금지
//   일반 학생 → 일반 교재 진도 mirror만 (+ 기타 메모)
// 자기 몫 진도도 기타 메모도 없으면 빈 문자열 — 임의 적용 없음.
// regular/legacy_exam 모드는 기존 전체 mirror 정책 그대로이므로 이 함수를 쓰지 않는다.
export function scopedMissedProgressCandidate(input: {
  student: ScopedStudent;
  targets: readonly ExamTarget[];
  schoolSections: readonly ContextSection[];
  textbookSections: readonly TextbookSection[];
  extraMemo: string;
}): string {
  if (isExamTargetStudent(input.student, input.targets)) {
    const section = sectionForStudent(input.schoolSections, input.student);
    const own = section?.text.trim()
      ? formatTextbookLinked(sectionDisplayName(section), section.text.trim())
      : "";
    return joinDerivedText(own, input.extraMemo).trim();
  }
  const mirror = buildTextbookSectionsText([...input.textbookSections]);
  return joinDerivedText(mirror, input.extraMemo).trim();
}
