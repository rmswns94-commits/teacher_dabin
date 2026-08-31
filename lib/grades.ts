import type { StudentGrade } from "@/lib/supabase/types";

// 학년 정의의 단일 소스. DB enum(grade_level)과 항상 일치해야 한다.
export const gradeValues = [
  "elementary_1",
  "elementary_2",
  "elementary_3",
  "elementary_4",
  "elementary_5",
  "elementary_6",
  "middle_1",
  "middle_2",
  "middle_3",
  "high_1",
] as const;

export const gradeDisplay: Record<StudentGrade, string> = {
  elementary_1: "초1",
  elementary_2: "초2",
  elementary_3: "초3",
  elementary_4: "초4",
  elementary_5: "초5",
  elementary_6: "초6",
  middle_1: "중1",
  middle_2: "중2",
  middle_3: "중3",
  high_1: "고1",
};

export const gradeOptions = gradeValues.map((value) => ({
  value,
  label: gradeDisplay[value],
}));

export function formatGrade(grade: string) {
  return gradeDisplay[grade as StudentGrade] ?? grade;
}
