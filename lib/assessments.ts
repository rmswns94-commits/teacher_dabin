// 빠른 체크 시험(단어/문법/독해)의 단일 소스 — category metadata + 저장 shape + 점수 계산.
//
// 저장 구조 (기존 데이터 무변경, additive):
//   단어(vocabulary)  기존 전용 컬럼 그대로 — daily_logs.vocab_total / student_lesson_logs.vocab_correct, vocab_retest
//                     (category 필드가 없던 기존 시험 기록은 전부 단어시험이므로 별도 backfill 없이 그대로 단어로 읽힌다)
//   문법/독해          category key로 묶인 jsonb — daily_logs.assessment_totals {grammar: 15, reading: 10}
//                     student_lesson_logs.assessment_results {grammar: {correct: 13, retest: false}, ...}
//                     (20261010_add_assessment_categories migration). 결과 모델(맞은 개수 + 재시험)은 단어와 같다.
// 한국어 라벨은 표시용일 뿐 DB identity가 아니다 — key는 vocabulary/grammar/reading.
import type { GrowthAchievementType } from "@/lib/supabase/types";

export type AssessmentCategory = "vocabulary" | "grammar" | "reading";
export type ExtraAssessmentCategory = Exclude<AssessmentCategory, "vocabulary">;

export type AssessmentCategoryMeta = {
  key: AssessmentCategory;
  label: string; // 단어
  testLabel: string; // 단어시험
  awardType: GrowthAchievementType; // vocabulary_master
};

export const ASSESSMENT_CATEGORIES: readonly AssessmentCategoryMeta[] = [
  { key: "vocabulary", label: "단어", testLabel: "단어시험", awardType: "vocabulary_master" },
  { key: "grammar", label: "문법", testLabel: "문법시험", awardType: "grammar_master" },
  { key: "reading", label: "독해", testLabel: "독해시험", awardType: "reading_master" },
];

export const EXTRA_ASSESSMENT_CATEGORIES: readonly ExtraAssessmentCategory[] = ["grammar", "reading"];

export function assessmentMeta(category: AssessmentCategory): AssessmentCategoryMeta {
  return ASSESSMENT_CATEGORIES.find((meta) => meta.key === category)!;
}

export function isExtraAssessmentCategory(value: unknown): value is ExtraAssessmentCategory {
  return value === "grammar" || value === "reading";
}

// ---- DB shape (jsonb) ----
export type AssessmentTotals = Partial<Record<ExtraAssessmentCategory, number>>;
export type AssessmentResult = { correct: number; retest: boolean };
export type AssessmentResults = Partial<Record<ExtraAssessmentCategory, AssessmentResult>>;

// 저장값 방어적 파싱 — 알 수 없는 key/잘못된 값은 버린다 (migration 전 row는 undefined → 빈 객체)
export function parseAssessmentTotals(value: unknown): AssessmentTotals {
  const out: AssessmentTotals = {};
  if (!value || typeof value !== "object") {
    return out;
  }
  for (const [key, total] of Object.entries(value as Record<string, unknown>)) {
    if (isExtraAssessmentCategory(key) && typeof total === "number" && Number.isInteger(total) && total > 0) {
      out[key] = total;
    }
  }
  return out;
}

export function parseAssessmentResults(value: unknown): AssessmentResults {
  const out: AssessmentResults = {};
  if (!value || typeof value !== "object") {
    return out;
  }
  for (const [key, result] of Object.entries(value as Record<string, unknown>)) {
    if (!isExtraAssessmentCategory(key) || !result || typeof result !== "object") {
      continue;
    }
    const correct = (result as { correct?: unknown }).correct;
    if (typeof correct === "number" && Number.isInteger(correct) && correct >= 0) {
      out[key] = { correct, retest: Boolean((result as { retest?: unknown }).retest) };
    }
  }
  return out;
}

// ---- 점수 ----
// 한 학생의 한 수업 기록에서 category 점수(%) — 유효한 시험 기록이 아니면 null (단어: 기존 규칙 그대로).
export type AssessmentScoreSource = {
  vocab_correct: number | null;
  vocab_total: number | null;
  assessment_results?: unknown;
  assessment_totals?: unknown;
};

export function assessmentPercentRaw(correct: number, total: number) {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

export function assessmentPercentOf(row: AssessmentScoreSource, category: AssessmentCategory): number | null {
  if (category === "vocabulary") {
    return row.vocab_correct !== null && (row.vocab_total ?? 0) > 0
      ? assessmentPercentRaw(row.vocab_correct, row.vocab_total!)
      : null;
  }
  const total = parseAssessmentTotals(row.assessment_totals)[category];
  const result = parseAssessmentResults(row.assessment_results)[category];
  return total && result ? assessmentPercentRaw(result.correct, total) : null;
}

// 학생 한 명의 수업 기록들(입력 순서 그대로)에서 category별 유효 점수 % 목록 — 성장왕 판정 입력.
// 순서는 호출부가 넘긴 순서를 바꾸지 않는다 (기존 단어왕 결과와 완전히 같게).
export function assessmentPercentsByCategory(
  rows: readonly AssessmentScoreSource[],
): Record<AssessmentCategory, number[]> {
  const out = { vocabulary: [], grammar: [], reading: [] } as Record<AssessmentCategory, number[]>;
  for (const row of rows) {
    for (const meta of ASSESSMENT_CATEGORIES) {
      const percent = assessmentPercentOf(row, meta.key);
      if (percent !== null) {
        out[meta.key].push(percent);
      }
    }
  }
  return out;
}

// ---- 폼 입력 (문자열 state) ----
export type AssessmentEntryInput = { correct: string; retest: boolean };
export type AssessmentEntryState = Record<ExtraAssessmentCategory, AssessmentEntryInput>;
export type AssessmentTotalsState = Record<ExtraAssessmentCategory, string>;

export function emptyAssessmentTotalsState(): AssessmentTotalsState {
  return { grammar: "", reading: "" };
}

export function emptyAssessmentEntryState(): AssessmentEntryState {
  return { grammar: { correct: "", retest: false }, reading: { correct: "", retest: false } };
}

export function assessmentTotalsStateFrom(value: unknown): AssessmentTotalsState {
  const parsed = parseAssessmentTotals(value);
  return { grammar: parsed.grammar ? String(parsed.grammar) : "", reading: parsed.reading ? String(parsed.reading) : "" };
}

export function assessmentEntryStateFrom(value: unknown): AssessmentEntryState {
  const parsed = parseAssessmentResults(value);
  const out = emptyAssessmentEntryState();
  for (const category of EXTRA_ASSESSMENT_CATEGORIES) {
    const result = parsed[category];
    if (result) {
      out[category] = { correct: String(result.correct), retest: result.retest };
    }
  }
  return out;
}

// draft payload 복원용 — 문자열 state shape만 받아들인다 (알 수 없는 값은 빈 값)
export function restoreAssessmentTotalsState(value: unknown): AssessmentTotalsState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  return {
    grammar: typeof raw.grammar === "string" ? raw.grammar : "",
    reading: typeof raw.reading === "string" ? raw.reading : "",
  };
}

// 서버 저장 payload — 총 문항이 있는 category만 (빈 category에 가짜 시험 record를 만들지 않는다)
export function assessmentTotalsForSave(input: Partial<Record<ExtraAssessmentCategory, string>> | undefined): AssessmentTotals {
  const out: AssessmentTotals = {};
  for (const category of EXTRA_ASSESSMENT_CATEGORIES) {
    const total = Number(input?.[category] || 0);
    if (Number.isInteger(total) && total > 0) {
      out[category] = total;
    }
  }
  return out;
}

// 학생 결과 payload — 맞은 개수가 입력된 category만 (0점은 유효한 기록이라 남긴다)
export function assessmentResultsForSave(
  input: Partial<Record<ExtraAssessmentCategory, { correct?: string; retest?: boolean }>> | undefined,
  totals: AssessmentTotals,
): AssessmentResults {
  const out: AssessmentResults = {};
  for (const category of EXTRA_ASSESSMENT_CATEGORIES) {
    const correct = input?.[category]?.correct;
    if (totals[category] && correct !== undefined && correct !== "" && Number.isInteger(Number(correct))) {
      out[category] = { correct: Number(correct), retest: Boolean(input?.[category]?.retest) };
    }
  }
  return out;
}

// 총 문항/학생 점수 검증 — 단어시험과 같은 규칙을 category마다 그대로 적용 (함수 하나)
export type AssessmentValidationIssue = { message: string; field: "total" | { studentIndex: number } };

export function validateAssessmentInput(
  category: AssessmentCategory,
  totalInput: string | undefined,
  corrects: readonly (string | undefined)[],
): AssessmentValidationIssue[] {
  const { testLabel } = assessmentMeta(category);
  const total = totalInput ? Number(totalInput) : null;
  if (total !== null && total <= 0) {
    return [{ message: `${testLabel} 총 문항 수는 1 이상이어야 해요.`, field: "total" }];
  }
  const issues: AssessmentValidationIssue[] = [];
  corrects.forEach((correctInput, studentIndex) => {
    if (!correctInput) {
      return;
    }
    const correct = Number(correctInput);
    if (total === null) {
      issues.push({ message: `${testLabel} 점수를 입력하려면 총 문항 수를 먼저 입력해주세요.`, field: { studentIndex } });
    } else if (correct > total) {
      issues.push({ message: `맞은 개수는 총 문항 수(${total})를 넘을 수 없어요.`, field: { studentIndex } });
    }
  });
  return issues;
}
