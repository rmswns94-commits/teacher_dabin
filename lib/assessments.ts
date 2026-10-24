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

export type AssessmentCategory = "vocabulary" | "grammar" | "reading" | "month_end";

// 시험 종류별 capability — 화면/저장/성장노트가 category 이름으로 if/else 하지 않고 이 metadata를 본다.
export type AssessmentCategoryMeta = {
  key: AssessmentCategory;
  label: string; // 단어
  testLabel: string; // 단어시험
  // 이 종류의 성장왕 (단어왕/문법왕/독해왕). 없으면 null — 월말평가는 성장왕이 아니라 순위 배지
  awardType: GrowthAchievementType | null;
  // 학생 카드에서 고정 3칸(단어/문법/독해) 중 하나인지 — 아니면 시험이 있을 때만 별도 섹션
  cardColumn: boolean;
  // 맞은 개수로 반 안 석차를 자동 계산해 보여주는 종류 (월말평가). 사용자가 등수를 입력하지 않는다
  rankedByScore: boolean;
  // [재시험 필요] 표시 → 재시험 관리 등록 대상인지
  supportsRetest: boolean;
};

export const ASSESSMENT_CATEGORIES: readonly AssessmentCategoryMeta[] = [
  { key: "vocabulary", label: "단어", testLabel: "단어시험", awardType: "vocabulary_master", cardColumn: true, rankedByScore: false, supportsRetest: true },
  { key: "grammar", label: "문법", testLabel: "문법시험", awardType: "grammar_master", cardColumn: true, rankedByScore: false, supportsRetest: true },
  { key: "reading", label: "독해", testLabel: "독해시험", awardType: "reading_master", cardColumn: true, rankedByScore: false, supportsRetest: true },
  { key: "month_end", label: "월말평가", testLabel: "월말평가", awardType: null, cardColumn: false, rankedByScore: true, supportsRetest: false },
];

export function assessmentMeta(category: AssessmentCategory): AssessmentCategoryMeta {
  return ASSESSMENT_CATEGORIES.find((meta) => meta.key === category)!;
}

export function isAssessmentCategory(value: unknown): value is AssessmentCategory {
  return value === "vocabulary" || value === "grammar" || value === "reading" || value === "month_end";
}

// ── 월말평가 자동 석차 ──
// 등수는 저장하지 않는 파생 값이다 — 맞은 개수(correct_count)만 source of truth.
// 범위: 시험 1개(stable assessment id) 안의 응시자 — 그 시험은 한 수업일지(= 한 학원·한 반)에만 속하므로
// 다른 반/다른 월말평가와 섞이지 않는다. 미입력(null)은 제외, 0점은 포함.
// 방식: standard competition ranking — 같은 점수는 같은 등수, 다음 등수는 그만큼 건너뛴다 (48,48,45 → 1,1,3).
export function calculateAssessmentRanks(scores: readonly { studentId: string; correct: number | null }[]): Map<string, number> {
  const valid = scores.filter((item): item is { studentId: string; correct: number } => item.correct !== null && Number.isFinite(item.correct));
  const out = new Map<string, number>();
  for (const item of valid) {
    out.set(item.studentId, 1 + valid.filter((other) => other.correct > item.correct).length);
  }
  return out;
}

// 상위 3등 배지 (성장노트) — 4등 이하는 배지 없음
export const TOP_RANK_EMOJI: Readonly<Record<number, string>> = { 1: "🥇", 2: "🥈", 3: "🥉" };
export const TOP_RANK_LIMIT = 3;

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
  if (typeof correct !== "number" || !Number.isInteger(correct) || correct < 0) {
    return null;
  }
  return { correct, retest: Boolean((value as { retest?: unknown }).retest) };
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
  const out = { vocabulary: [], grammar: [], reading: [], month_end: [] } as Record<AssessmentCategory, number[]>;
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

// 맞은 개수/총 문항 규칙의 단일 소스 — 수업 시험 입력과 재시험 시도 점수가 같은 규칙·같은 문구를 쓴다.
// 총 문항: 정수 ≥ 1 / 맞은 개수: 정수 ≥ 0 (0점 유효), 총 문항 이하.
export function parseTotalQuestions(totalInput: string | undefined) {
  const total = totalInput?.trim() ? Number(totalInput) : null;
  return total !== null && Number.isInteger(total) && total > 0 ? total : null;
}

export const scoreOverTotalMessage = (total: number) => `맞은 개수는 총 문항 수(${total})를 넘을 수 없어요.`;

// 점수 한 쌍(맞은 개수 + 총 문항, 둘 다 필수) — 재시험 시도처럼 빈 값을 허용하지 않는 입력용
export function validateScorePair(correctInput: string, totalInput: string):
  | { ok: true; correct: number; total: number }
  | { ok: false; field: "correct" | "total"; message: string } {
  const total = parseTotalQuestions(totalInput);
  if (total === null) {
    return { ok: false, field: "total", message: "총 문항 수는 1 이상이어야 해요." };
  }
  const correct = correctInput.trim() ? Number(correctInput) : null;
  if (correct === null || !Number.isInteger(correct) || correct < 0) {
    return { ok: false, field: "correct", message: "맞은 개수를 입력해주세요." };
  }
  if (correct > total) {
    return { ok: false, field: "correct", message: scoreOverTotalMessage(total) };
  }
  return { ok: true, correct, total };
}

export function validateAssessmentInput(
  category: AssessmentCategory,
  totalInput: string | undefined,
  corrects: readonly (string | undefined)[],
): AssessmentValidationIssue[] {
  const { testLabel } = assessmentMeta(category);
  const total = parseTotalQuestions(totalInput);
  if (total === null) {
    return [{ message: `${testLabel} 총 문항 수는 1 이상이어야 해요.`, field: "total" }];
  }
  const issues: AssessmentValidationIssue[] = [];
  corrects.forEach((correctInput, studentIndex) => {
    if (correctInput && Number(correctInput) > total) {
      issues.push({ message: scoreOverTotalMessage(total), field: { studentIndex } });
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
// 재시험 표시는 재시험을 받는 종류만 저장한다 (capability metadata 기준). 등수는 저장하지 않는다 (파생 값).
export function scoresForSave(
  input: Record<string, { correct?: string; retest?: boolean }> | undefined,
  list: readonly LessonAssessment[],
): Record<string, AssessmentScore> {
  const out: Record<string, AssessmentScore> = {};
  for (const assessment of list) {
    const value = input?.[assessment.id];
    if (value?.correct !== undefined && value.correct !== "" && Number.isInteger(Number(value.correct))) {
      const meta = assessmentMeta(assessment.category);
      out[assessment.id] = {
        correct: Number(value.correct),
        retest: meta.supportsRetest ? Boolean(value.retest) : false,
      };
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
  const counts: Record<AssessmentCategory, number> = { vocabulary: 0, grammar: 0, reading: 0, month_end: 0 };
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

// ── 월말평가 석차 배지 (성장노트) ──
// 완료된 일지의 결과만. 석차는 그 일지(그 수업)의 "당시 응시자 전체" 결과로 계산한다 — 현재 반 명단으로
// 다시 계산하지 않으므로, 이후 반 이동/퇴원이 있어도 과거 석차는 바뀌지 않는다 (rows에 그 일지의 모든 학생 기록을 넘길 것).
// 배지는 상위 3등만, 시험마다 1개 (같은 달 월말평가가 둘이면 배지도 둘). 왕중왕 개수에는 넣지 않는다.
export type AssessmentRankBadge = { assessmentId: string; date: string; rank: number; label: string; emoji: string };

type RankRow = LessonAssessmentSource & StudentAssessmentSource & { student_id: string; class_date: string; daily_log_id: string };

export function assessmentRanksOfLog(rows: readonly RankRow[], assessment: LessonAssessment) {
  return calculateAssessmentRanks(
    rows.map((row) => ({ studentId: row.student_id, correct: studentScoreFor(row, assessment)?.correct ?? null })),
  );
}

export function assessmentRankBadgesOf(rows: readonly RankRow[], start: string, end: string): Map<string, AssessmentRankBadge[]> {
  const byLog = new Map<string, RankRow[]>();
  for (const row of rows) {
    if (row.class_date >= start && row.class_date <= end) {
      byLog.set(row.daily_log_id, [...(byLog.get(row.daily_log_id) ?? []), row]);
    }
  }
  const out = new Map<string, AssessmentRankBadge[]>();
  for (const logRows of byLog.values()) {
    for (const assessment of lessonAssessmentsOf(logRows[0])) {
      const meta = assessmentMeta(assessment.category);
      if (!meta.rankedByScore) {
        continue;
      }
      for (const [studentId, rank] of assessmentRanksOfLog(logRows, assessment)) {
        if (rank > TOP_RANK_LIMIT) {
          continue;
        }
        out.set(studentId, [
          ...(out.get(studentId) ?? []),
          { assessmentId: assessment.id, date: logRows[0].class_date, rank, label: `${meta.label} ${rank}등`, emoji: TOP_RANK_EMOJI[rank] },
        ]);
      }
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank);
  }
  return out;
}
