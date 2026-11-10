// 시험 대비의 canonical scope — "학교 + 학년" (school-only 금지).
// 같은 학교라도 학년이 다르면 완전히 독립적인 시험 대비 대상이다.
//
// grade 규칙:
//  - string  = students.grade enum 값("middle_1" 등) — 새로 저장되는 scope는 항상 학년 포함
//  - null    = legacy "학교 전체" scope. 기존 school-only 저장(exam_target_schools,
//              grade 없는 jsonb 항목)을 읽을 때만 생긴다. 현재 학생 학년으로 추측/backfill 금지 —
//              변환은 사용자가 UI에서 직접 학년을 선택했을 때만 한다.
//
// in-memory key(React key/Map key/select value)에는 scopeToken을 쓴다 (PART AJ).
// 토큰은 화면에 그대로 보여주지 않고(formatScopeToken), DB에는 절대 토큰 문자열을
// 저장하지 않는다 — 저장은 항상 분리된 school/grade 필드(structured).

import { formatGrade, gradeValues } from "@/lib/grades";

export type ExamTarget = { school: string; grade: string | null };

// 학교 이름에 섞일 수 없는 제어문자(Unit Separator)로 토큰을 만든다.
// 키보드로 입력 불가능한 문자라 자유입력 학교명과 충돌하지 않는다.
export const SCOPE_TOKEN_SEPARATOR = "\u001F";

export function scopeToken(school: string, grade?: string | null): string {
  const name = school.trim();
  return grade ? `${name}${SCOPE_TOKEN_SEPARATOR}${grade}` : name;
}

export function examTargetToken(target: ExamTarget): string {
  return scopeToken(target.school, target.grade);
}

export function parseScopeToken(token: string): ExamTarget {
  const index = token.indexOf(SCOPE_TOKEN_SEPARATOR);
  if (index < 0) {
    return { school: token.trim(), grade: null };
  }
  const grade = token.slice(index + SCOPE_TOKEN_SEPARATOR.length);
  return {
    school: token.slice(0, index).trim(),
    grade: (gradeValues as readonly string[]).includes(grade) ? grade : null,
  };
}

// 표시용 — "가산중학교 · 중1". legacy(전체) scope는 학교명만 (기존 표기와 동일).
export function formatExamTarget(target: { school: string; grade?: string | null }): string {
  const name = target.school.trim();
  return target.grade ? `${name} · ${formatGrade(target.grade)}` : name;
}

export function formatScopeToken(token: string): string {
  return formatExamTarget(parseScopeToken(token));
}

const koreanCollator = new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true });
const gradeRank = new Map<string, number>(gradeValues.map((value, index) => [value, index]));

// 정렬: 학교 가나다 → 같은 학교 안에서는 legacy(전체) 먼저, 그다음 학년 순(초1→고1)
export function compareExamTargets(a: ExamTarget, b: ExamTarget): number {
  const bySchool = koreanCollator.compare(a.school, b.school);
  if (bySchool !== 0) {
    return bySchool;
  }
  const rankA = a.grade ? (gradeRank.get(a.grade) ?? 99) : -1;
  const rankB = b.grade ? (gradeRank.get(b.grade) ?? 99) : -1;
  return rankA - rankB;
}

// 학생 목록 → 학교+학년 scope 목록 (trim, (school, grade) 기준 dedupe, 정렬).
// 학교 미등록 학생은 제외. 학년은 students.grade canonical field만 사용한다.
export function uniqueSchoolGradeScopes(
  students: readonly { school?: string | null; grade?: string | null }[],
): ExamTarget[] {
  const seen = new Set<string>();
  const scopes: ExamTarget[] = [];
  for (const student of students) {
    const school = student.school?.trim();
    const grade = student.grade ?? null;
    if (!school || !grade) {
      continue;
    }
    const key = scopeToken(school, grade);
    if (!seen.has(key)) {
      seen.add(key);
      scopes.push({ school, grade });
    }
  }
  return scopes.sort(compareExamTargets);
}

// target 1개 ↔ 학생 1명 매칭.
// grade가 있는 target = 학교+학년 모두 정확 일치. legacy(null) target = 학교만 일치(전 학년).
export function targetMatchesStudent(
  target: ExamTarget,
  student: { school?: string | null; grade?: string | null },
): boolean {
  const school = student.school?.trim();
  if (!school || school !== target.school.trim()) {
    return false;
  }
  return target.grade === null || target.grade === (student.grade ?? null);
}

// 그룹 row → canonical target 목록.
// exam_targets(jsonb, 신규)가 있으면 그것만 사용하고, 없으면 legacy exam_target_schools를
// "학교 전체" scope로 해석한다. 둘 다 null이면 null(= legacy_exam 미설정 상태 유지).
export function normalizeExamTargets(group: {
  exam_targets?: { school?: unknown; grade?: unknown }[] | null;
  exam_target_schools?: string[] | null;
}): ExamTarget[] | null {
  if (Array.isArray(group.exam_targets)) {
    const seen = new Set<string>();
    const targets: ExamTarget[] = [];
    for (const item of group.exam_targets) {
      const school = typeof item?.school === "string" ? item.school.trim() : "";
      if (!school) {
        continue;
      }
      const grade =
        typeof item?.grade === "string" && (gradeValues as readonly string[]).includes(item.grade)
          ? item.grade
          : null;
      const key = scopeToken(school, grade);
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ school, grade });
      }
    }
    return targets.sort(compareExamTargets);
  }
  if (Array.isArray(group.exam_target_schools)) {
    return group.exam_target_schools
      .map((name) => name.trim())
      .filter(Boolean)
      .map((school) => ({ school, grade: null }))
      .sort(compareExamTargets);
  }
  return null;
}
