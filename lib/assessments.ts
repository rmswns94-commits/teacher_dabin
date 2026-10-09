// 빠른 체크 시험(단어/문법/독해)의 단일 소스 — category metadata + 수업 시험 목록 모델 + 점수 계산.
//
// 수업 하나에 시험을 여러 개(같은 종류 여러 개 포함) 둘 수 있다. 시험 identity는 category가 아니라
// stable assessment id이고, 학생 결과는 (student_id, assessment_id)로 연결된다.
//
// 저장 구조 (schema 변경 없음 — 20261010 migration의 jsonb 컬럼 재사용):
//   daily_logs.assessment_totals          시험 목록 배열 [{ id, category, total }] (추가한 순서 = 배열 순서)
//   student_lesson_logs.assessment_results 학생 결과 { [assessmentId]: { correct, retest } }
//   단어 전용 컬럼(vocab_total / vocab_correct / vocab_retest)은 목록의 "첫 단어시험"을 그대로 미러링한다
//   — 브리핑/학생 상세 등 기존 단어시험 소비처가 계속 동작하도록. 목록이 있으면 목록이 정본이다.
//
// 이전 형식 호환 (기존 데이터 무변경):
//   assessment_totals가 배열이 아니면(이전 저장) → vocab 컬럼 = 시험 id "vocabulary",
//   {grammar: n, reading: n} 객체 = 시험 id "grammar"/"reading"으로 읽는다. 이전 결과 객체도 같은 key라
//   그대로 매칭된다. 다시 저장하면 그 id를 유지한 채 배열 형식으로 저장된다.
import type { GrowthAchievementType } from "@/lib/supabase/types";

export type AssessmentCategory = "vocabulary" | "grammar" | "reading";

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

export function assessmentMeta(category: AssessmentCategory): AssessmentCategoryMeta {
  return ASSESSMENT_CATEGORIES.find((meta) => meta.key === category)!;
}

export function isAssessmentCategory(value: unknown): value is AssessmentCategory {
  return value === "vocabulary" || value === "grammar" || value === "reading";
}

export function assessmentPercentRaw(correct: number, total: number) {
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

// ---- 저장된 모델 ----
export type LessonAssessment = { id: string; category: AssessmentCategory; total: number };
export type AssessmentScore = { correct: number; retest: boolean };

export type LessonAssessmentSource = { vocab_total: number | null; assessment_totals?: unknown };
export type StudentAssessmentSource = {
  vocab_correct: number | null;
  vocab_retest?: boolean | null;
  assessment_results?: unknown;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const positiveInt = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0;

// 수업의 시험 목록 (순서 = 추가한 순서). 형식이 깨진 항목은 버린다 (추측 복구 없음).
export function lessonAssessmentsOf(log: LessonAssessmentSource): LessonAssessment[] {
  const raw = log.assessment_totals;
  if (Array.isArray(raw)) {
    const seen = new Set<string>();
    const out: LessonAssessment[] = [];
    for (const item of raw) {
      const { id, category, total } = (item ?? {}) as { id?: unknown; category?: unknown; total?: unknown };
      if (typeof id === "string" && ID_PATTERN.test(id) && !seen.has(id) && isAssessmentCategory(category) && positiveInt(total)) {
        seen.add(id);
        out.push({ id, category, total: total as number });
      }
    }
    return out;
  }
  // 이전 형식 — 단어 컬럼 + {grammar, reading} 객체
  const out: LessonAssessment[] = [];
  if (positiveInt(log.vocab_total)) {
    out.push({ id: "vocabulary", category: "vocabulary", total: log.vocab_total! });
  }
  if (raw && typeof raw === "object") {
    for (const category of ["grammar", "reading"] as const) {
      const total = (raw as Record<string, unknown>)[category];
      if (positiveInt(total)) {
        out.push({ id: category, category, total: total as number });
      }
    }
  }
  return out;
}

function parseScore(value: unknown): AssessmentScore | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const correct = (value as { correct?: unknown }).correct;
  return typeof correct === "number" && Number.isInteger(correct) && correct >= 0
    ? { correct, retest: Boolean((value as { retest?: unknown }).retest) }
    : null;
}

// 한 학생의 한 시험 결과 — null = 미입력 (0점은 유효한 결과)
export function studentScoreFor(row: StudentAssessmentSource, assessment: LessonAssessment): AssessmentScore | null {
  const results = row.assessment_results;
  if (results && typeof results === "object" && !Array.isArray(results)) {
    const score = parseScore((results as Record<string, unknown>)[assessment.id]);
    if (score) {
      return score;
    }
  }
  // 이전 형식의 단어시험 — 결과는 단어 컬럼에 있다
  if (assessment.id === "vocabulary" && row.vocab_correct !== null && row.vocab_correct >= 0) {
    return { correct: row.vocab_correct, retest: Boolean(row.vocab_retest) };
  }
  return null;
}

// 학생 한 명의 수업 기록들(입력 순서 그대로)에서 category별 유효 점수 % — 성장왕 판정 입력.
// 한 수업에 같은 종류 시험이 여러 개면 각 시험을 독립된 1회로 넣는다 (수업 안에서는 추가한 순서).
export function assessmentPercentsByCategory(
  rows: readonly (LessonAssessmentSource & StudentAssessmentSource)[],
): Record<AssessmentCategory, number[]> {
  const out = { vocabulary: [], grammar: [], reading: [] } as Record<AssessmentCategory, number[]>;
  for (const row of rows) {
    for (const assessment of lessonAssessmentsOf(row)) {
      const score = studentScoreFor(row, assessment);
      const percent = score ? assessmentPercentRaw(score.correct, assessment.total) : null;
      if (percent !== null) {
        out[assessment.category].push(percent);
      }
    }
  }
  return out;
}

// ---- 폼 state (문자열 입력) ----
export type AssessmentDraft = { id: string; category: AssessmentCategory; total: string };
export type ScoreInput = { correct: string; retest: boolean };
export type ScoreInputs = Record<string, ScoreInput>; // key = assessment id

export function newAssessmentId() {
  return globalThis.crypto.randomUUID();
}

export function assessmentsToDrafts(list: readonly LessonAssessment[]): AssessmentDraft[] {
  return list.map((item) => ({ id: item.id, category: item.category, total: String(item.total) }));
}

export function scoresToInputs(row: StudentAssessmentSource, list: readonly LessonAssessment[]): ScoreInputs {
  const out: ScoreInputs = {};
  for (const assessment of list) {
    const score = studentScoreFor(row, assessment);
    if (score) {
      out[assessment.id] = { correct: String(score.correct), retest: score.retest };
    }
  }
  return out;
}

// draft payload의 시험 목록 복원 — 새 형식(assessments 배열)만 그대로, 이전 draft(vocabTotal/assessmentTotals)는 변환
export function restoreAssessmentDrafts(payload: {
  assessments?: unknown;
  vocabTotal?: unknown;
  assessmentTotals?: unknown;
}): AssessmentDraft[] | null {
  if (Array.isArray(payload.assessments)) {
    const seen = new Set<string>();
    return payload.assessments.flatMap((item) => {
      const { id, category, total } = (item ?? {}) as { id?: unknown; category?: unknown; total?: unknown };
      if (typeof id !== "string" || !ID_PATTERN.test(id) || seen.has(id) || !isAssessmentCategory(category)) {
        return [];
      }
      seen.add(id);
      return [{ id, category, total: typeof total === "string" ? total : "" }];
    });
  }
  if (typeof payload.vocabTotal !== "string" && !payload.assessmentTotals) {
    return null;
  }
  const out: AssessmentDraft[] = [];
  if (typeof payload.vocabTotal === "string" && payload.vocabTotal.trim()) {
    out.push({ id: "vocabulary", category: "vocabulary", total: payload.vocabTotal });
  }
  const totals = payload.assessmentTotals as Record<string, unknown> | undefined;
  for (const category of ["grammar", "reading"] as const) {
    const total = totals?.[category];
    if (typeof total === "string" && total.trim()) {
      out.push({ id: category, category, total });
    }
  }
  return out;
}

// draft entry의 점수 복원 — 새 형식(assessmentScores)이 없으면 이전 draft 필드(vocabCorrect/assessmentResults)에서 변환
export function restoreScoreInputs(entry: {
  assessmentScores?: unknown;
  vocabCorrect?: unknown;
  vocabRetest?: unknown;
  assessmentResults?: unknown;
}): ScoreInputs | null {
  if (entry.assessmentScores && typeof entry.assessmentScores === "object") {
    const out: ScoreInputs = {};
    for (const [id, value] of Object.entries(entry.assessmentScores as Record<string, unknown>)) {
      const correct = (value as { correct?: unknown })?.correct;
      if (ID_PATTERN.test(id) && typeof correct === "string") {
        out[id] = { correct, retest: Boolean((value as { retest?: unknown }).retest) };
      }
    }
    return out;
  }
  if (typeof entry.vocabCorrect !== "string" && !entry.assessmentResults) {
    return null;
  }
  const out: ScoreInputs = {};
  if (typeof entry.vocabCorrect === "string" && entry.vocabCorrect) {
    out.vocabulary = { correct: entry.vocabCorrect, retest: Boolean(entry.vocabRetest) };
  }
  const legacy = entry.assessmentResults as Record<string, { correct?: unknown; retest?: unknown }> | undefined;
  for (const category of ["grammar", "reading"] as const) {
    const correct = legacy?.[category]?.correct;
    if (typeof correct === "string" && correct) {
      out[category] = { correct, retest: Boolean(legacy?.[category]?.retest) };
    }
  }
  return out;
}

// ---- 검증 (단어/문법/독해 공통 — 함수 하나) ----
export type AssessmentValidationIssue = { message: string; field: "total" | { studentIndex: number } };

export function validateAssessmentInput(
  category: AssessmentCategory,
  totalInput: string | undefined,
  corrects: readonly (string | undefined)[],
): AssessmentValidationIssue[] {
  const { testLabel } = assessmentMeta(category);
  const total = totalInput ? Number(totalInput) : null;
  if (total === null || total <= 0) {
    return [{ message: `${testLabel} 총 문항 수는 1 이상이어야 해요.`, field: "total" }];
  }
  const issues: AssessmentValidationIssue[] = [];
  corrects.forEach((correctInput, studentIndex) => {
    if (correctInput && Number(correctInput) > total) {
      issues.push({ message: `맞은 개수는 총 문항 수(${total})를 넘을 수 없어요.`, field: { studentIndex } });
    }
  });
  return issues;
}

// 입력 하나가 총 문항을 넘는지 (화면 즉시 표시용 — 저장 검증과 같은 기준, 값을 바꾸지 않는다)
export function scoreExceedsTotal(correct: string, total: string) {
  return Boolean(correct) && Boolean(total.trim()) && Number(correct) > Number(total);
}

// ---- 저장 payload ----
export function assessmentsForSave(input: readonly { id: string; category: string; total: string }[] | undefined): LessonAssessment[] {
  const seen = new Set<string>();
  const out: LessonAssessment[] = [];
  for (const item of input ?? []) {
    const total = Number(item.total);
    if (ID_PATTERN.test(item.id) && !seen.has(item.id) && isAssessmentCategory(item.category) && Number.isInteger(total) && total > 0) {
      seen.add(item.id);
      out.push({ id: item.id, category: item.category, total });
    }
  }
  return out;
}

// 학생 결과 — 존재하는 시험 + 맞은 개수 입력된 것만 (빈 값은 저장 안 함 = null, 0은 저장)
export function scoresForSave(
  input: Record<string, { correct?: string; retest?: boolean }> | undefined,
  list: readonly LessonAssessment[],
): Record<string, AssessmentScore> {
  const out: Record<string, AssessmentScore> = {};
  for (const assessment of list) {
    const value = input?.[assessment.id];
    if (value?.correct !== undefined && value.correct !== "" && Number.isInteger(Number(value.correct))) {
      out[assessment.id] = { correct: Number(value.correct), retest: Boolean(value.retest) };
    }
  }
  return out;
}

// 기존 단어시험 소비처용 미러 — 목록의 첫 단어시험
export function firstVocabularyAssessment(list: readonly LessonAssessment[]) {
  return list.find((item) => item.category === "vocabulary") ?? null;
}

// 같은 종류 시험 안에서의 번호 (추가한 순서, 1부터) — 화면 표시용. 같은 종류가 하나뿐이면 번호 없이 표시한다.
export function assessmentOrdinals(list: readonly { id: string; category: AssessmentCategory }[]) {
  const counts: Record<AssessmentCategory, number> = { vocabulary: 0, grammar: 0, reading: 0 };
  const ordinals: Record<string, number> = {};
  for (const item of list) {
    counts[item.category] += 1;
    ordinals[item.id] = counts[item.category];
  }
  return (item: { id: string; category: AssessmentCategory }) => ({
    ordinal: ordinals[item.id] ?? 1,
    sameCount: counts[item.category],
    // 단어시험 / 단어시험 2
    name:
      counts[item.category] > 1
        ? `${assessmentMeta(item.category).testLabel} ${ordinals[item.id] ?? 1}`
        : assessmentMeta(item.category).testLabel,
  });
}
