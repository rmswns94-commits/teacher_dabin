import { z } from "zod";

import type { WeaknessCategory } from "@/lib/supabase/types";

export const weaknessCategoryValues = [
  "grammar",
  "vocabulary",
  "reading",
  "listening",
  "writing",
  "pronunciation",
  "homework",
  "other",
] as const;

export const weaknessCategoryLabels: Record<WeaknessCategory, string> = {
  grammar: "문법",
  vocabulary: "단어",
  reading: "독해",
  listening: "듣기",
  writing: "쓰기",
  pronunciation: "발음",
  homework: "숙제",
  other: "기타",
};

const reviewDueDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "다시 확인할 날짜 형식을 확인해주세요.")
  .optional()
  .or(z.literal(""));

// 등록/수정 공용 필드 (분류·내용·메모·다시 확인 날짜)
export const weaknessFieldsSchema = z.object({
  category: z.enum(weaknessCategoryValues, { message: "분류를 선택해주세요." }),
  title: z
    .string()
    .trim()
    .min(1, "약점 내용을 입력해주세요.")
    .max(120, "약점 내용은 120자 이내로 입력해주세요."),
  note: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
  reviewDueDate: reviewDueDateField,
});

export const weaknessCreateSchema = weaknessFieldsSchema.extend({
  studentId: z.string().uuid(),
  groupId: z.string().uuid().optional().or(z.literal("")),
  sourceDailyLogId: z.string().uuid().optional().or(z.literal("")),
});

export type WeaknessFieldsInput = z.infer<typeof weaknessFieldsSchema>;
export type WeaknessCreateInput = z.infer<typeof weaknessCreateSchema>;
