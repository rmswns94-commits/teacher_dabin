// Quick-comment templates for the daily log form.
// 향후 사용자별 커스텀 템플릿으로 확장할 때 이 상수를 DB 기반으로 교체한다.

export const strengthPresets = [
  "숙제를 잘 해왔어요",
  "단어 암기가 좋았어요",
  "집중해서 참여했어요",
  "독해가 늘고 있어요",
  "문법 이해도가 좋았어요",
  "질문을 적극적으로 했어요",
] as const;

export const improvementPresets = [
  "단어 복습이 필요해요",
  "문법 복습이 필요해요",
  "숙제 확인이 필요해요",
  "독해 연습이 필요해요",
  "서술형 연습이 필요해요",
  "집중 연습이 필요해요",
] as const;
