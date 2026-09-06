import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해주세요.");

// 시험 대비 계획 (단원/할 내용/메모) — 플래너 Sheet의 등록/수정 공용
export const examPlanSchema = z.object({
  planDate: dateString,
  unitLabel: z
    .string()
    .trim()
    .max(30, "단원 구분은 30자 이내로 입력해주세요.")
    .optional()
    .or(z.literal("")),
  title: z
    .string()
    .trim()
    .min(1, "할 내용을 입력해주세요.")
    .max(120, "할 내용은 120자 이내로 입력해주세요."),
  memo: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
});

export type ExamPlanFormInput = z.infer<typeof examPlanSchema>;
