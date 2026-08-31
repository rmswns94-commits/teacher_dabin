import { z } from "zod";

import { todayDateString } from "@/lib/dates";
import { gradeValues } from "@/lib/grades";

export const studentGradeValues = gradeValues;

export const genderLabels = {
  male: "남학생",
  female: "여학생",
} as const;

export const genderShortLabels = {
  male: "남",
  female: "여",
} as const;

const birthDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "생일 형식을 확인해주세요.")
  .refine((value) => value <= todayDateString(), {
    message: "생일은 오늘 이후 날짜로 설정할 수 없어요.",
  })
  .optional()
  .or(z.literal(""));

export const studentSchema = z.object({
  name: z.string().trim().min(1, "학생 이름을 입력해주세요.").max(60, "학생 이름은 60자 이내로 입력해주세요."),
  grade: z.enum(gradeValues, { message: "학년을 선택해주세요." }),
  school: z.string().trim().max(80, "학교 이름은 80자 이내로 입력해주세요.").optional().or(z.literal("")),
  memo: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
  gender: z.enum(["male", "female"]).optional().or(z.literal("")),
  birthDate: birthDateField,
  groupId: z.string().uuid().optional().or(z.literal("")),
  groupIds: z.array(z.string().uuid()).max(20).optional(),
});

export type StudentFormInput = z.infer<typeof studentSchema>;
