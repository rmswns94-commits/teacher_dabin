// Phase 4(영어 지문/문제 생성) 전까지 남아 있는 mock 데이터.
// 수업일지/출결/보충수업은 Phase 3에서 실제 Supabase 데이터로 전환됨.

export type Student = {
  id: string;
  name: string;
  grade: string;
  className: string;
  recentProgress: string;
  lastLesson: string;
  makeupStatus: "없음" | "보충 필요" | "예정" | "완료";
  attendance: string;
  phone?: string;
  note?: string;
};

export const passages = [
  { title: "School Life Review", grade: "중1", updatedAt: "8월 25일" },
  { title: "Travel Journal", grade: "중2", updatedAt: "8월 29일" },
  { title: "Environmental Issues", grade: "고1", updatedAt: "8월 30일" },
  { title: "Daily Routine Interview", grade: "중3", updatedAt: "8월 31일" },
];
