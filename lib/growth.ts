import type { GrowthAchievementType, MakeupStatus } from "@/lib/supabase/types";

// 9개 성장 Achievement 자동 판정 엔진 (단일 소스).
//
// Teacher는 왕을 직접 고르지 않는다 — Daily Log에 실제 관찰값만 기록하고,
// 이 rule engine이 주간 누적 데이터로 자동 계산한다.
//
// Mapping:
//   출결 → 개근 / 숙제 → 꾸준함왕 / 단어시험 → 단어왕 / 집중 → 집중왕
//   참여 → 발표왕 / 질문 → 질문왕 / 배려 → 배려왕 / 노력 → 노력왕
//   보충수업 완료 → 틈새왕
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
  "makeup_master",
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
  makeup_master: "틈새왕",
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
  makeup_master: "🧩",
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
  makeup_master: "놓친 수업도 꼼꼼하게 보충하며 배운 내용을 빈틈없이 채웠어요!",
};

// 성장노트 첫 화면용 학생 친화 설명 (내부 rule 숫자는 노출하지 않는다)
export const growthGuideDescriptions: Record<GrowthAchievementType, string> = {
  attendance_master: "수업에 빠짐없이 성실하게 참여해요!",
  consistency_master: "숙제를 꾸준히 잘 챙기는 멋진 습관을 보여줘요!",
  vocabulary_master: "단어 공부를 꾸준히 하며 멋진 실력을 보여줘요!",
  focus_master: "수업에 귀 기울이고 집중하는 모습을 보여줘요!",
  presentation_master: "수업과 발표에 자신 있게 참여해요!",
  question_master: "궁금한 것을 그냥 지나치지 않고 적극적으로 질문해요!",
  kindness_master: "친구를 생각하고 배려하는 따뜻한 모습을 보여줘요!",
  effort_master: "어려운 것도 쉽게 포기하지 않고 끝까지 해보려고 노력해요!",
  makeup_master: "놓친 수업도 보충하며 배운 내용을 꼼꼼하게 채워요!",
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
  // 틈새왕: 주간 평가 대상 보충이 1개 이상 + 완료율 100% (0개면 미획득 — 0/0 ≠ 100%)
  makeup: { minSamples: 1, completionRatio: 1.0 },
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

// ---- 틈새왕 (보충수업 완료) ----
export type MakeupLike = {
  status: MakeupStatus;
  scheduled_date: string | null;
  completed_date: string | null;
};

// "해당 주 평가 대상" 보충: 실제 보충 실시/예정 날짜가 선택 주에 포함되는 record만.
// 날짜가 전혀 없는 required(미정) record는 특정 주에 귀속시키지 않는다.
export function scopeMakeupsToWeek<T extends MakeupLike>(
  makeups: T[],
  weekStart: string,
  weekEnd: string,
): T[] {
  return makeups.filter((makeup) => {
    const relevantDate =
      makeup.status === "completed"
        ? makeup.completed_date ?? makeup.scheduled_date
        : makeup.scheduled_date;

    return relevantDate !== null && relevantDate >= weekStart && relevantDate <= weekEnd;
  });
}

// cancelled는 denominator에서 제외, completed만 numerator.
export function calculateMakeupStat(weekMakeups: MakeupLike[]): GrowthStat {
  let evaluated = 0;
  let positive = 0;

  for (const makeup of weekMakeups) {
    if (makeup.status === "cancelled") {
      continue;
    }

    evaluated += 1;
    if (makeup.status === "completed") positive += 1;
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
  // 이번 주 평가 대상 보충수업 (scopeMakeupsToWeek로 미리 주간 범위에 귀속시켜 전달)
  weekMakeups?: MakeupLike[];
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

  // 틈새왕: 주간 평가 대상 보충 >= 1 + 완료율 100% (보충이 필요 없던 학생에겐 주지 않는다)
  const makeupStat = calculateMakeupStat(input.weekMakeups ?? []);
  stats.makeup_master = makeupStat;
  if (
    makeupStat.evaluated >= GROWTH_CONFIG.makeup.minSamples &&
    makeupStat.ratio >= GROWTH_CONFIG.makeup.completionRatio
  ) {
    achieved.push("makeup_master");
  }

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
