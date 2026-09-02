import type { GrowthAchievementType } from "@/lib/supabase/types";

// "오늘의 성장" 체크와 주간 성취 판정의 단일 소스.
//
// 역할 분리 (매우 중요):
//  - Daily Log의 성장 체크 = 선생님이 그날 발견한 긍정 행동의 "근거 기록"
//  - 주간 리포트의 최종 성취 = 아래 rule이 누적 데이터로 판정
//    · 객관 데이터가 있는 항목(개근/단어왕/노력왕/꾸준함왕)은 DB 기록 rule이 우선,
//      manual 체크만으로 획득되지 않는다.
//    · 관찰 중심 항목(질문왕/발표왕/배려왕/집중왕)은 체크+기존 기록을 합산하되
//      같은 수업(daily_log)의 동일 행동은 1회로 dedup한다.

export const growthAchievementValues = [
  "question_master",
  "attendance_master",
  "vocabulary_master",
  "effort_master",
  "consistency_master",
  "presentation_master",
  "kindness_master",
  "focus_master",
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

// chip hover/aria용 짧은 설명 (그날의 관찰 의미)
export const growthDescriptions: Record<GrowthAchievementType, string> = {
  question_master: "궁금한 것을 적극적으로 질문했어요.",
  attendance_master: "오늘 성실하게 참여했어요.",
  vocabulary_master: "단어 학습에서 특히 좋은 모습을 보였어요.",
  effort_master: "결과와 무관하게 노력하는 모습이 눈에 띄었어요.",
  consistency_master: "학습 습관을 꾸준히 유지했어요.",
  presentation_master: "발표에 자신 있게 참여했어요.",
  kindness_master: "친구를 배려하는 멋진 모습을 보여줬어요.",
  focus_master: "수업 집중이 특히 좋았어요.",
};

// 주간 성취 문장 (학생/리포트용)
export const growthAchievedSentences: Record<GrowthAchievementType, string> = {
  question_master: "이번 주 적극적으로 질문했어요.",
  attendance_master: "이번 주 수업에 모두 출석했어요.",
  vocabulary_master: "최근 단어시험을 연속 만점으로 통과했어요.",
  effort_master: "단어시험 점수가 꾸준히 크게 올랐어요.",
  consistency_master: "숙제를 연속으로 모두 해왔어요.",
  presentation_master: "발표에 자신 있게 참여했어요.",
  kindness_master: "친구를 배려하는 모습을 보여줬어요.",
  focus_master: "수업 집중이 꾸준히 좋았어요.",
};

// 노력왕: 최근 3회 상승 + 총 상승폭 기준 (%p)
export const EFFORT_RISE_THRESHOLD = 15;

export type WeeklyGrowthInput = {
  // 이번 주 수업 기록 (수업 1회 = 1항목)
  weekRecords: {
    dailyLogId: string | null;
    attendance: "present" | "late" | "absent";
    homeworkStatus: "completed" | "partial" | "missing" | null;
    focusLevel: "good" | "normal" | "distracted" | null;
    participationLevel: "active" | "normal" | "passive" | null;
  }[];
  // 이번 주 성장 체크 (수업당 항목별 1개 — DB unique 보장)
  weekChecks: { dailyLogId: string; achievementType: GrowthAchievementType }[];
  // 이번 주 칭찬 (kindness dedup용)
  weekPraises: { dailyLogId: string | null; category: string }[];
  // 최근 단어시험 % 목록 (오래된 → 최신), 유효 시험만
  recentVocabPercents: number[];
  // 최근 숙제 체크가 있는 기록의 상태 (최신 → 과거)
  recentHomeworkStatuses: ("completed" | "partial" | "missing")[];
};

export type WeeklyGrowthResult = {
  achieved: GrowthAchievementType[];
  // 관찰 evidence 횟수 (dedup 후, 수업 단위)
  evidenceCounts: Partial<Record<GrowthAchievementType, number>>;
};

function checkedLogs(
  checks: WeeklyGrowthInput["weekChecks"],
  type: GrowthAchievementType,
) {
  return new Set(checks.filter((c) => c.achievementType === type).map((c) => c.dailyLogId));
}

export function computeWeeklyGrowth(input: WeeklyGrowthInput): WeeklyGrowthResult {
  const achieved: GrowthAchievementType[] = [];
  const evidenceCounts: WeeklyGrowthResult["evidenceCounts"] = {};

  // ---- 관찰 중심 (수업 단위 dedup: 같은 수업의 체크+기록은 1회) ----

  // 질문왕: question 체크 수업 3회 이상
  const questionLogs = checkedLogs(input.weekChecks, "question_master");
  evidenceCounts.question_master = questionLogs.size;
  if (questionLogs.size >= 3) achieved.push("question_master");

  // 발표왕: presentation 체크 ∪ 참여=적극 수업 3회 이상
  const presentationLogs = checkedLogs(input.weekChecks, "presentation_master");
  for (const record of input.weekRecords) {
    if (record.participationLevel === "active" && record.dailyLogId) {
      presentationLogs.add(record.dailyLogId);
    }
  }
  evidenceCounts.presentation_master = presentationLogs.size;
  if (presentationLogs.size >= 3) achieved.push("presentation_master");

  // 배려왕: kindness 체크 ∪ kindness 칭찬 수업 2회 이상
  const kindnessLogs = checkedLogs(input.weekChecks, "kindness_master");
  for (const praise of input.weekPraises) {
    if (praise.category === "kindness" && praise.dailyLogId) {
      kindnessLogs.add(praise.dailyLogId);
    }
  }
  evidenceCounts.kindness_master = kindnessLogs.size;
  if (kindnessLogs.size >= 2) achieved.push("kindness_master");

  // 집중왕: focus 체크 ∪ 집중=좋음 수업 3회 이상
  const focusLogs = checkedLogs(input.weekChecks, "focus_master");
  for (const record of input.weekRecords) {
    if (record.focusLevel === "good" && record.dailyLogId) {
      focusLogs.add(record.dailyLogId);
    }
  }
  evidenceCounts.focus_master = focusLogs.size;
  if (focusLogs.size >= 3) achieved.push("focus_master");

  // ---- 객관 데이터 rule (manual 체크는 획득에 영향 없음) ----

  // 개근: 이번 주 수업이 있고 전부 출석 (지각/결석 없음)
  if (
    input.weekRecords.length > 0 &&
    input.weekRecords.every((record) => record.attendance === "present")
  ) {
    achieved.push("attendance_master");
  }

  // 단어왕: 최근 유효 시험 3회 모두 100%
  const lastThree = input.recentVocabPercents.slice(-3);
  if (lastThree.length === 3 && lastThree.every((percent) => percent === 100)) {
    achieved.push("vocabulary_master");
  }

  // 노력왕: 최근 3회 연속 상승 + 총 상승폭 기준 이상
  if (
    lastThree.length === 3 &&
    lastThree[0] < lastThree[1] &&
    lastThree[1] < lastThree[2] &&
    lastThree[2] - lastThree[0] >= EFFORT_RISE_THRESHOLD
  ) {
    achieved.push("effort_master");
  }

  // 꾸준함왕: 숙제 체크가 있는 최근 5회 모두 완료
  const lastFiveHomework = input.recentHomeworkStatuses.slice(0, 5);
  if (lastFiveHomework.length === 5 && lastFiveHomework.every((s) => s === "completed")) {
    achieved.push("consistency_master");
  }

  return { achieved, evidenceCounts };
}
