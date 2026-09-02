import type { GrowthAchievementType } from "@/lib/supabase/types";

// 8개 성장 Achievement 자동 판정 엔진 (단일 소스).
//
// Teacher는 왕을 직접 고르지 않는다 — Daily Log에 실제 관찰값만 기록하고,
// 이 rule engine이 주간 누적 데이터로 자동 계산한다.
//
// Mapping:
//   출결 → 개근 / 숙제 → 꾸준함왕 / 단어시험 → 단어왕 / 집중 → 집중왕
//   참여 → 발표왕 / 질문 → 질문왕 / 배려 → 배려왕 / 노력 → 노력왕
//
// Null 원칙: 미입력(null)은 "보통/나쁨"이 아니라 평가 제외 — denominator에서 뺀다.
// legacy manual growth check(student_growth_checks)는 보존하되 판정에 사용하지 않는다.

export const growthAchievementValues = [
  "attendance_master",
  "consistency_master",
  "vocabulary_master",
  "focus_master",
  "presentation_master",
  "question_master",
  "kindness_master",
  "effort_master",
] as const;

export const growthLabels: Record<GrowthAchievementType, string> = {
  question_master: "질문왕",
  attendance_master: "개근",
  vocabulary_master: "단어왕",
  effort_master: "노력왕",
  consistency_master: "꾸준함왕",
  presentation_master: "발표왕",
  kindness_master: "배려왕",
  focus_master: "집중왕",
};

export const growthEmojis: Record<GrowthAchievementType, string> = {
  attendance_master: "🏫",
  consistency_master: "📚",
  vocabulary_master: "🏆",
  focus_master: "🎯",
  presentation_master: "🙋",
  question_master: "💬",
  kindness_master: "💗",
  effort_master: "🌱",
};

export const growthAchievedSentences: Record<GrowthAchievementType, string> = {
  attendance_master: "이번 주 수업에 빠짐없이 참여했어요!",
  consistency_master: "이번 주 숙제를 빠짐없이 완료했어요!",
  vocabulary_master: "최근 단어시험에서 100점을 3번 연속 달성했어요!",
  focus_master: "이번 주 수업에 집중하는 모습이 정말 좋았어요!",
  presentation_master: "수업과 발표에 적극적으로 참여했어요!",
  question_master: "궁금한 것을 적극적으로 질문했어요!",
  kindness_master: "친구를 배려하는 멋진 모습을 자주 보여줬어요!",
  effort_master: "어려운 것도 포기하지 않고 꾸준히 노력했어요!",
};

// ---- threshold config (component에서 숫자 hard-code 금지) ----
export const GROWTH_CONFIG = {
  question: { minSamples: 2, positiveRatio: 0.6 },
  kindness: { minSamples: 2, positiveRatio: 0.6 },
  effort: { minSamples: 2, positiveRatio: 0.6 },
  focus: { minSamples: 2, positiveRatio: 0.7 },
  participation: { minSamples: 2, positiveRatio: 0.6 },
  homework: { minSamples: 2, positiveRatio: 1.0 },
  vocabPerfectStreak: 3,
} as const;

export type GrowthStat = { evaluated: number; positive: number; ratio: number };

// 공통 ratio helper: null/undefined는 denominator 제외
export function calculatePositiveRatio<T>(
  records: T[],
  getValue: (record: T) => string | null | undefined,
  positiveValue: string,
): GrowthStat {
  let evaluated = 0;
  let positive = 0;

  for (const record of records) {
    const value = getValue(record);

    if (value === null || value === undefined || value === "") {
      continue;
    }

    evaluated += 1;
    if (value === positiveValue) positive += 1;
  }

  return { evaluated, positive, ratio: evaluated > 0 ? positive / evaluated : 0 };
}

export type WeeklyGrowthInput = {
  // 이번 주 학생별 수업 기록 (미입력 field는 null)
  weekRecords: {
    attendance: "present" | "late" | "absent";
    homeworkStatus: "completed" | "partial" | "missing" | null;
    focusLevel: "good" | "normal" | "distracted" | null;
    participationLevel: "active" | "normal" | "passive" | null;
    questionLevel: "high" | "normal" | "low" | null;
    kindnessLevel: "good" | "normal" | "poor" | null;
    effortLevel: "high" | "normal" | "low" | null;
  }[];
  // 최근 유효 단어시험 % (오래된 → 최신)
  recentVocabPercents: number[];
};

export type WeeklyGrowthResult = {
  achieved: GrowthAchievementType[];
  stats: Partial<Record<GrowthAchievementType, GrowthStat>>;
  // 단어 점수 상승은 노력왕 판정과 분리된 "성장 사실"로만 제공
  vocabTrend: { from: number; to: number; rise: number } | null;
};

function meets(stat: GrowthStat, config: { minSamples: number; positiveRatio: number }) {
  return stat.evaluated >= config.minSamples && stat.ratio >= config.positiveRatio;
}

export function computeWeeklyGrowth(input: WeeklyGrowthInput): WeeklyGrowthResult {
  const achieved: GrowthAchievementType[] = [];
  const stats: WeeklyGrowthResult["stats"] = {};
  const records = input.weekRecords;

  // 개근: 이번 주 수업이 있고 전부 present (지각/결석 없음)
  if (records.length > 0 && records.every((record) => record.attendance === "present")) {
    achieved.push("attendance_master");
  }

  // 꾸준함왕: 숙제 평가 >= 2 + 전부 완료 (100%)
  const homework = calculatePositiveRatio(records, (r) => r.homeworkStatus, "completed");
  stats.consistency_master = homework;
  if (meets(homework, GROWTH_CONFIG.homework)) achieved.push("consistency_master");

  // 단어왕: 최근 유효 시험 3회 모두 100%
  const lastThree = input.recentVocabPercents.slice(-GROWTH_CONFIG.vocabPerfectStreak);
  if (
    lastThree.length === GROWTH_CONFIG.vocabPerfectStreak &&
    lastThree.every((percent) => percent === 100)
  ) {
    achieved.push("vocabulary_master");
  }

  // 집중왕 / 발표왕 / 질문왕 / 배려왕 / 노력왕: 평가된 값 기준 ratio rule
  const focus = calculatePositiveRatio(records, (r) => r.focusLevel, "good");
  stats.focus_master = focus;
  if (meets(focus, GROWTH_CONFIG.focus)) achieved.push("focus_master");

  const participation = calculatePositiveRatio(records, (r) => r.participationLevel, "active");
  stats.presentation_master = participation;
  if (meets(participation, GROWTH_CONFIG.participation)) achieved.push("presentation_master");

  const question = calculatePositiveRatio(records, (r) => r.questionLevel, "high");
  stats.question_master = question;
  if (meets(question, GROWTH_CONFIG.question)) achieved.push("question_master");

  const kindness = calculatePositiveRatio(records, (r) => r.kindnessLevel, "good");
  stats.kindness_master = kindness;
  if (meets(kindness, GROWTH_CONFIG.kindness)) achieved.push("kindness_master");

  const effort = calculatePositiveRatio(records, (r) => r.effortLevel, "high");
  stats.effort_master = effort;
  if (meets(effort, GROWTH_CONFIG.effort)) achieved.push("effort_master");

  // 단어 성장 사실: 최근 3회가 하락 없이 상승했을 때 (노력왕과 무관한 정보)
  let vocabTrend: WeeklyGrowthResult["vocabTrend"] = null;
  if (lastThree.length >= 2) {
    const nonDecreasing = lastThree.every(
      (percent, index) => index === 0 || percent >= lastThree[index - 1],
    );
    const rise = lastThree[lastThree.length - 1] - lastThree[0];

    if (nonDecreasing && rise > 0) {
      vocabTrend = { from: lastThree[0], to: lastThree[lastThree.length - 1], rise };
    }
  }

  return { achieved, stats, vocabTrend };
}
