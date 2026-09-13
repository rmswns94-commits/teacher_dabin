// PHASE 2 — Daily Log 혼합 진도의 canonical resolver.
// 그룹의 진도 모드는 오직 이 순서로 판정한다 (STEP 37의 조건 순서가 규약):
//   1) is_exam_period OFF          → "regular"      (기존 교재별 진도 — 저장된 target은 무시)
//   2) ON + exam_target_schools 배열 → "mixed"       (시험 대상 학교별 + 일반 교재별 공존)
//   3) ON + exam_target_schools null → "legacy_exam" (PHASE 1 이전 그룹 — 기존 전체 학교별 방식 유지)
// legacy 그룹을 자동으로 mixed로 변환하지 않는다 (설정은 그룹 상세에서 Teacher가 직접).
//
// 학생 분류의 유일한 소스는 "그룹에 저장된 시험 대상 학교 설정"이며 (PHASE 1 저장값),
// Exam record/플래너 존재 여부로 추론하지 않는다. Student.school은 매핑에만 쓰고,
// 매칭은 trim된 정확 일치만 허용한다 (includes/startsWith/fuzzy 금지).
// 학교 미등록 학생은 어떤 target과도 매칭될 수 없으므로 항상 일반 수업(regular) 측이다.

import {
  buildTextbookSectionsText,
  formatTextbookLinked,
  joinDerivedText,
  type TextbookSection,
} from "@/lib/textbooks";

export type ProgressMode = "regular" | "mixed" | "legacy_exam";

export function resolveProgressMode(
  isExamPeriod: boolean,
  examTargetSchools: string[] | null | undefined,
): ProgressMode {
  if (!isExamPeriod) {
    return "regular";
  }
  if (Array.isArray(examTargetSchools)) {
    return "mixed";
  }
  return "legacy_exam";
}

// 학생 1명이 시험 대상인지 — trim 정확 일치만 (빈 학교/미등록은 항상 false)
export function isExamTargetStudent(
  school: string | null | undefined,
  targetSchools: readonly string[],
): boolean {
  const name = school?.trim();
  if (!name) {
    return false;
  }
  return targetSchools.some((target) => target.trim() === name);
}

// 현재 그룹 학생들을 시험/일반 두 집합으로 분류 (파생 계산 — 저장하지 않는다)
export function classifyStudentsByExamTarget<T extends { school?: string | null }>(
  students: readonly T[],
  targetSchools: readonly string[],
): { examStudents: T[]; regularStudents: T[] } {
  const examStudents: T[] = [];
  const regularStudents: T[] = [];
  for (const student of students) {
    if (isExamTargetStudent(student.school, targetSchools)) {
      examStudents.push(student);
    } else {
      regularStudents.push(student);
    }
  }
  return { examStudents, regularStudents };
}

// 신규 일지의 시험 진도 입력에 표시할 학교 = 저장된 target 중 "현재 학생이 있는" 학교만.
// memberSchools(현재 학생들의 학교 — uniqueSchoolList로 이미 가나다 정렬)를 필터하므로
// 순서는 가나다가 유지되고, 학생 0명인 stale target은 입력에서 제외된다
// (저장된 설정 자체는 삭제하지 않는다 — 관리 UI는 그룹 상세).
export function activeTargetSchools(
  targetSchools: readonly string[],
  memberSchools: readonly string[],
): string[] {
  const targets = new Set(targetSchools.map((name) => name.trim()).filter(Boolean));
  return memberSchools.filter((school) => targets.has(school.trim()));
}

// Mixed Mode에서 학생 1명에게 적용/스냅샷할 진도 후보 — 교차 적용 방지가 목적.
//   시험 학생 → 자기 학교의 시험 진도만 (+ 기타 메모)
//   일반 학생 → 일반 교재 진도 mirror만 (+ 기타 메모)
// 다른 학교/교재의 진도는 절대 섞지 않는다. 기타 메모는 "학교·교재와 무관한" 내용이라
// (구조화 편집기가 없는 free-text 공통 진도도 여기로 들어온다) 양쪽 모두에 안전하게 포함한다.
// 자기 몫 진도도 기타 메모도 없으면 빈 문자열 — 임의 적용 없음.
// regular/legacy_exam 모드는 기존 전체 mirror 정책 그대로이므로 이 함수를 쓰지 않는다.
export function scopedMissedProgressCandidate(input: {
  studentSchool: string | null | undefined;
  targetSchools: readonly string[];
  schoolSections: readonly TextbookSection[];
  textbookSections: readonly TextbookSection[];
  extraMemo: string;
}): string {
  if (isExamTargetStudent(input.studentSchool, input.targetSchools)) {
    const school = input.studentSchool!.trim();
    const section = input.schoolSections.find((item) => item.name.trim() === school);
    const own = section?.text.trim()
      ? formatTextbookLinked(school, section.text.trim())
      : "";
    return joinDerivedText(own, input.extraMemo).trim();
  }
  const mirror = buildTextbookSectionsText([...input.textbookSections]);
  return joinDerivedText(mirror, input.extraMemo).trim();
}
