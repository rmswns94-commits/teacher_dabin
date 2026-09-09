import { z } from "zod";

import { gradeValues } from "@/lib/grades";

export const classGroupSchema = z.object({
  name: z.string().trim().min(1, "그룹 이름을 입력해주세요.").max(60, "그룹 이름은 60자 이내로 입력해주세요."),
  grade: z.enum(gradeValues, { message: "학년을 선택해주세요." }),
  memo: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
  textbook: z.string().trim().max(1000, "교재 정보가 너무 길어요.").optional().or(z.literal("")),
  highlightMemo: z.string().trim().max(500, "하이라이트 메모는 500자 이내로 입력해주세요.").optional().or(z.literal("")),
});

export type ClassGroupFormInput = z.infer<typeof classGroupSchema>;

const timeString = z.string().regex(/^\d{2}:\d{2}$/, "시간 형식을 확인해주세요.");

export const groupScheduleSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6, "요일을 선택해주세요."),
    startTime: timeString,
    endTime: timeString,
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "종료 시간은 시작 시간보다 늦어야 해요.",
    path: ["endTime"],
  });

export type GroupScheduleFormInput = z.infer<typeof groupScheduleSchema>;
