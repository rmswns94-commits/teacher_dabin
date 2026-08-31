import { z } from "zod";

export const prettyWordCategories = [
  "comfort",
  "encouragement",
  "teaching",
  "love",
  "life",
  "other",
] as const;

export type PrettyWordCategory = (typeof prettyWordCategories)[number];

export const prettyWordCategoryLabels: Record<PrettyWordCategory, string> = {
  comfort: "위로",
  encouragement: "응원",
  teaching: "수업",
  love: "사랑",
  life: "삶",
  other: "기타",
};

export const prettyWordSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "문장을 입력해주세요.")
    .max(500, "문장은 500자 이내로 적어주세요."),
  author: z.string().trim().max(100, "출처는 100자 이내로 적어주세요.").optional().or(z.literal("")),
  category: z.enum(prettyWordCategories).optional().or(z.literal("")),
});

export type PrettyWordFormInput = z.infer<typeof prettyWordSchema>;
