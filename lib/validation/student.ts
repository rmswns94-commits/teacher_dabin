import { z } from "zod";

import { gradeValues } from "@/lib/grades";

export const studentGradeValues = gradeValues;

export const studentSchema = z.object({
  name: z.string().trim().min(1, "학생 이름을 입력해주세요.").max(60, "학생 이름은 60자 이내로 입력해주세요."),
  grade: z.enum(gradeValues, { message: "학년을 선택해주세요." }),
  school: z.string().trim().max(80, "학교 이름은 80자 이내로 입력해주세요.").optional().or(z.literal("")),
  memo: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
  groupId: z.string().uuid().optional().or(z.literal("")),
});

export type StudentFormInput = z.infer<typeof studentSchema>;
