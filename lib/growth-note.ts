import {
  computeWeeklyGrowth,
  growthAchievedSentences,
  growthEmojis,
  growthLabels,
  type WeeklyGrowthInput,
} from "@/lib/growth";
import type {
  AttendanceStatus,
  EffortLevel,
  FocusLevel,
  GrowthAchievementType,
  HomeworkStatus,
  KindnessLevel,
  ParticipationLevel,
  PraiseCategory,
  QuestionLevel,
} from "@/lib/supabase/types";

// 성장노트(학생에게 그대로 보여주는 화면) 전용 ViewModel 빌더.
//
// 원칙:
// - 왕 판정은 lib/growth.ts 엔진 결과만 사용한다 (여기서 rule 재구현 금지).
// - Teacher private 정보(관리 메모, 학부모 전달, 보완점 원문 등)는
//   ViewModel에 아예 넣지 않는다 — CSS로 숨기는 방식 금지.
// - 부정/기술적 표현("데이터 부족", "미제출!") 대신 사실 기반의 긍정 서술만 담는다.

export type GrowthNoteLessonRecord = {
  attendance: AttendanceStatus;
  homeworkStatus: HomeworkStatus | null;
  focusLevel: FocusLevel | null;
  participationLevel: ParticipationLevel | null;
  questionLevel: QuestionLevel | null;
  kindnessLevel: KindnessLevel | null;
  effortLevel: EffortLevel | null;
  vocabRetest: boolean;
  strengths: string | null;
};

export type GrowthBadge = {
  type: GrowthAchievementType;
  emoji: string;
  label: string;
  sentence: string;
};

export type StudentGrowthCardSummary = {
  studentId: string;
  studentName: string;
  groupNames: string[];
  achievements: GrowthBadge[];
  praiseCount: number;
};

export type StudentGrowthNoteViewModel = {
  studentName: string;
  groupNames: string[];
  weekStart: string;
  weekEnd: string;
  hasWeekRecords: boolean;
  badges: GrowthBadge[];
  encouragement: string;
  goodThings: string[];
  homework: { completed: number; evaluated: number; sentence: string } | null;
  vocab: { percents: number[]; rise: number | null; sentence: string | null } | null;
  attendance: { attended: number; total: number; sentence: string | null } | null;
  teacherHighlights: string[];
  nextGoals: string[];
};

export function toGrowthBadge(type: GrowthAchievementType): GrowthBadge {
  return {
    type,
    emoji: growthEmojis[type],
    label: growthLabels[type],
    sentence: growthAchievedSentences[type],
  };
}

// ---- 이번 주 잘한 일: 구조화된 관찰값 → deterministic 학생용 문장 ----
// 같은 category가 여러 번 관찰돼도 대표 문장 하나만 쓴다 (반복 금지).
const observationPhrases: Partial<Record<GrowthAchievementType, string>> = {
  question_master: "궁금한 것을 적극적으로 질문했어요.",
  kindness_master: "친구를 배려하는 모습을 보여줬어요.",
  effort_master: "어려운 문제도 끝까지 해보려고 노력했어요.",
  presentation_master: "수업에 자신 있게 참여했어요.",
  focus_master: "수업에 집중하는 모습을 보여줬어요.",
};

const praisePhrases: Record<PraiseCategory, string> = {
  homework: "숙제를 성실하게 잘 챙겨왔어요.",
  focus: "수업에 집중하는 모습을 보여줬어요.",
  participation: "수업에 자신 있게 참여했어요.",
  vocabulary: "단어시험을 열심히 준비했어요.",
  kindness: "친구를 배려하는 모습을 보여줬어요.",
  other: "선생님에게 특별한 칭찬을 받았어요.",
};

// ---- 이번 주의 한마디 (deterministic — AI provider가 없는 환경에서도 항상 동작) ----
// 가장 의미 있는 성장 포인트 1~3개를 자연스럽게 연결한다. 없는 사실은 만들지 않는다.
const encouragementPriority: GrowthAchievementType[] = [
  "question_master",
  "kindness_master",
  "effort_master",
  "vocabulary_master",
  "consistency_master",
  "focus_master",
  "presentation_master",
  "attendance_master",
];

const connectiveFragments: Record<GrowthAchievementType, string> = {
  question_master: "궁금한 것을 적극적으로 질문하고",
  kindness_master: "친구를 배려하고",
  effort_master: "어려운 것도 포기하지 않고 노력하고",
  vocabulary_master: "단어시험을 완벽하게 준비하고",
  consistency_master: "숙제를 꾸준히 챙기고",
  focus_master: "수업에 집중하고",
  presentation_master: "자신 있게 발표하고",
  attendance_master: "수업에 빠짐없이 참여하고",
};

const finalFragments: Record<GrowthAchievementType, string> = {
  question_master: "궁금한 것을 적극적으로 질문한",
  kindness_master: "친구를 배려한",
  effort_master: "어려운 것도 끝까지 노력한",
  vocabulary_master: "단어시험을 완벽하게 해낸",
  consistency_master: "숙제를 빠짐없이 해온",
  focus_master: "수업에 집중한",
  presentation_master: "자신 있게 발표한",
  attendance_master: "수업에 빠짐없이 참여한",
};

const singleAchievementEncouragements: Record<GrowthAchievementType, string> = {
  question_master: "궁금한 것을 적극적으로 질문하며 한 걸음 더 성장했어요!",
  kindness_master: "친구를 배려하는 따뜻한 마음이 정말 멋졌어요! 💗",
  effort_master: "이번 주에도 포기하지 않고 끝까지 노력하는 모습이 정말 멋졌어요! 🌱",
  vocabulary_master: "꾸준히 준비한 만큼 멋진 결과가 따라왔어요. 정말 잘했어요! ⭐",
  consistency_master: "숙제를 꾸준히 챙기는 성실한 모습이 정말 멋졌어요!",
  focus_master: "수업에 집중하는 모습이 한 주 내내 반짝반짝 빛났어요!",
  presentation_master: "수업에 자신 있게 참여하는 모습이 정말 멋졌어요!",
  attendance_master: "이번 주 수업에 빠짐없이 참여했어요. 정말 잘했어요!",
};

export function buildEncouragement(
  achieved: GrowthAchievementType[],
  vocabTrend: { rise: number } | null,
): string {
  const picked = encouragementPriority.filter((type) => achieved.includes(type)).slice(0, 3);

  if (picked.length === 0) {
    if (vocabTrend) {
      return `최근 단어시험에서 ${vocabTrend.rise}점이나 성장했어요. 이번 주도 잘하고 있어요! 🌱`;
    }
    return "이번 주에도 하나씩 배워가고 있어요. 다음 수업도 힘내봐요! 🌱";
  }

  if (picked.length === 1) {
    return singleAchievementEncouragements[picked[0]];
  }

  const heads = picked.slice(0, -1).map((type) => connectiveFragments[type]);
  const tail = finalFragments[picked[picked.length - 1]];
  return `${heads.join(", ")}, ${tail} 모습이 정말 멋졌어요! 🌱`;
}

export type BuildGrowthNoteInput = {
  studentName: string;
  groupNames: string[];
  weekStart: string;
  weekEnd: string;
  weekRecords: GrowthNoteLessonRecord[];
  // 선택한 주 이전까지의 최근 유효 단어시험 % (오래된 → 최신, bounded)
  recentVocabPercents: number[];
  // 이번 주 칭찬 category 목록 (내용은 category 라벨 기반 문장만 사용)
  weekPraiseCategories: PraiseCategory[];
};

export function buildGrowthNoteViewModel(input: BuildGrowthNoteInput): StudentGrowthNoteViewModel {
  const weekRecords: WeeklyGrowthInput["weekRecords"] = input.weekRecords.map((record) => ({
    attendance: record.attendance,
    homeworkStatus: record.homeworkStatus,
    focusLevel: record.focusLevel,
    participationLevel: record.participationLevel,
    questionLevel: record.questionLevel,
    kindnessLevel: record.kindnessLevel,
    effortLevel: record.effortLevel,
  }));

  const growth = computeWeeklyGrowth({
    weekRecords,
    recentVocabPercents: input.recentVocabPercents,
  });

  // 잘한 일: 관찰값에서 positive가 1회라도 있으면 대표 문장 1개 + 칭찬 category 문장 (중복 제거)
  const goodThings: string[] = [];
  for (const [type, phrase] of Object.entries(observationPhrases) as [
    GrowthAchievementType,
    string,
  ][]) {
    const stat = growth.stats[type];
    if (stat && stat.positive > 0 && !goodThings.includes(phrase)) {
      goodThings.push(phrase);
    }
  }
  for (const category of input.weekPraiseCategories) {
    const phrase = praisePhrases[category];
    if (phrase && !goodThings.includes(phrase)) {
      goodThings.push(phrase);
    }
  }

  // 숙제: 평가된 기록이 있을 때만 (사실 기반, 부정 표현 없이)
  const homeworkEvaluated = input.weekRecords.filter((r) => r.homeworkStatus !== null).length;
  const homeworkCompleted = input.weekRecords.filter((r) => r.homeworkStatus === "completed").length;
  const homework =
    homeworkEvaluated > 0
      ? {
          completed: homeworkCompleted,
          evaluated: homeworkEvaluated,
          sentence:
            homeworkCompleted === homeworkEvaluated
              ? "이번 주 숙제를 모두 잘 챙겼어요!"
              : `이번 주 숙제 ${homeworkEvaluated}번 중 ${homeworkCompleted}번 완료했어요.`,
        }
      : null;

  // 단어: 최근 유효 시험 최대 3회. 상승이면 성장 문장, 아니면 중립 표시. Trend 조작 금지.
  const recentPercents = input.recentVocabPercents.slice(-3);
  const vocab =
    recentPercents.length > 0
      ? {
          percents: recentPercents,
          rise: growth.vocabTrend?.rise ?? null,
          sentence: growth.vocabTrend
            ? `최근 시험에서 ${growth.vocabTrend.rise}점 성장했어요!`
            : recentPercents.length === 1
              ? `이번 시험 ${recentPercents[0]}점!`
              : null,
        }
      : null;

  // 출석: 지각도 "참여한 날"로 센다 — 학생용 화면에서 부정 강조 금지
  const attended = input.weekRecords.filter((r) => r.attendance !== "absent").length;
  const attendance =
    input.weekRecords.length > 0
      ? {
          attended,
          total: input.weekRecords.length,
          sentence: growth.achieved.includes("attendance_master")
            ? "이번 주 수업에 빠짐없이 참여했어요!"
            : null,
        }
      : null;

  // 선생님이 발견한 멋진 모습: 잘한 부분(strengths)만 사용 — 보완점/메모는 절대 넣지 않는다
  const teacherHighlights = [
    ...new Set(
      input.weekRecords
        .map((record) => record.strengths?.trim())
        .filter((text): text is string => Boolean(text)),
    ),
  ].slice(0, 3);

  // 다음 주 작은 목표: 학생에게 보여도 되는 wording만 deterministic 생성 (최대 2개)
  const nextGoals: string[] = [];
  if (input.weekRecords.some((record) => record.vocabRetest)) {
    nextGoals.push("단어를 한 번 더 복습해서 다시 도전해보기");
  }
  if (homework && homework.completed < homework.evaluated) {
    nextGoals.push("다음 주에는 숙제를 모두 챙겨보기");
  }

  return {
    studentName: input.studentName,
    groupNames: input.groupNames,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    hasWeekRecords: input.weekRecords.length > 0,
    badges: growth.achieved.map(toGrowthBadge),
    encouragement: buildEncouragement(growth.achieved, growth.vocabTrend),
    goodThings: goodThings.slice(0, 5),
    homework,
    vocab,
    attendance,
    teacherHighlights,
    nextGoals: nextGoals.slice(0, 2),
  };
}
