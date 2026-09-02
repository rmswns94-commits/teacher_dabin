import type {
  EffortLevel,
  FocusLevel,
  HomeworkStatus,
  KindnessLevel,
  ParticipationLevel,
  PraiseCategory,
  QuestionLevel,
} from "@/lib/supabase/types";

// 초등 학생 기록 라벨/톤의 단일 소스 (폼·상세·리포트 공용)

export const homeworkStatusValues = ["completed", "partial", "missing"] as const;
export const homeworkStatusLabels: Record<HomeworkStatus, string> = {
  completed: "완료",
  partial: "일부",
  missing: "미제출",
};

export const focusLevelValues = ["good", "normal", "distracted"] as const;
export const focusLevelLabels: Record<FocusLevel, string> = {
  good: "좋음",
  normal: "보통",
  distracted: "산만",
};

export const participationLevelValues = ["active", "normal", "passive"] as const;
export const participationLevelLabels: Record<ParticipationLevel, string> = {
  active: "적극",
  normal: "보통",
  passive: "소극",
};

export const questionLevelValues = ["high", "normal", "low"] as const;
export const questionLevelLabels: Record<QuestionLevel, string> = {
  high: "많음",
  normal: "보통",
  low: "적음",
};

export const kindnessLevelValues = ["good", "normal", "poor"] as const;
export const kindnessLevelLabels: Record<KindnessLevel, string> = {
  good: "좋음",
  normal: "보통",
  poor: "나쁨",
};

export const effortLevelValues = ["high", "normal", "low"] as const;
export const effortLevelLabels: Record<EffortLevel, string> = {
  high: "많음",
  normal: "보통",
  low: "적음",
};

export const praiseCategoryValues = [
  "homework",
  "focus",
  "participation",
  "vocabulary",
  "kindness",
  "other",
] as const;

export const praiseCategoryLabels: Record<PraiseCategory, string> = {
  homework: "숙제",
  focus: "집중",
  participation: "발표",
  vocabulary: "단어시험",
  kindness: "친구 배려",
  other: "기타",
};

// percentage는 DB에 중복 저장하지 않고 표시 시 계산한다.
export function vocabPercent(correct: number, total: number) {
  if (total <= 0) {
    return null;
  }

  return Math.round((correct / total) * 100);
}
