import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해주세요.");

const shortText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}은(는) ${max}자 이내로 입력해주세요.`).optional().or(z.literal(""));

const numberString = z
  .string()
  .regex(/^\d*$/, "숫자만 입력해주세요.")
  .max(4, "숫자를 확인해주세요.");

export const studentLessonEntrySchema = z.object({
  studentId: z.string().uuid(),
  attendance: z.enum(["present", "late", "absent"], { message: "출결 상태를 확인해주세요." }),
  progress: shortText(300, "진도"),
  strengths: shortText(1000, "잘한 부분"),
  improvements: shortText(1000, "보완할 부분"),
  memo: shortText(1000, "메모"),
  missedProgress: shortText(300, "놓친 진도"),
  needsMakeup: z.boolean(),
  makeupScheduledDate: dateString.optional().or(z.literal("")),
  // 초등 quick check (전부 optional — 입력 안 한 값은 null로 저장)
  homeworkStatus: z.enum(["completed", "partial", "missing"]).optional().or(z.literal("")),
  vocabCorrect: numberString.optional().or(z.literal("")),
  vocabRetest: z.boolean().optional(),
  focusLevel: z.enum(["good", "normal", "distracted"]).optional().or(z.literal("")),
  participationLevel: z.enum(["active", "normal", "passive"]).optional().or(z.literal("")),
  parentNoteNeeded: z.boolean().optional(),
  parentNote: shortText(1000, "학부모 전달 내용"),
  praises: z
    .array(z.enum(["homework", "focus", "participation", "vocabulary", "kindness", "other"]))
    .max(20, "칭찬은 수업당 20개까지 기록할 수 있어요.")
    .optional(),
  questionLevel: z.enum(["high", "normal", "low"]).optional().or(z.literal("")),
  kindnessLevel: z.enum(["good", "normal", "poor"]).optional().or(z.literal("")),
  effortLevel: z.enum(["high", "normal", "low"]).optional().or(z.literal("")),
});

export const dailyLogSchema = z
  .object({
    dailyLogId: z.string().uuid().optional(),
    classDate: dateString,
    groupId: z.string().uuid({ message: "수업 그룹을 선택해주세요." }),
    title: shortText(120, "수업 제목"),
    lessonContent: shortText(2000, "수업 내용"),
    defaultProgress: shortText(300, "공통 진도"),
    memo: shortText(1000, "메모"),
    homework: shortText(1000, "오늘 숙제"),
    nextLessonPlan: shortText(1000, "다음 수업 계획"),
    vocabTotal: numberString.optional().or(z.literal("")),
    status: z.enum(["draft", "completed"], { message: "저장 상태를 확인해주세요." }),
    students: z.array(studentLessonEntrySchema).min(1, "학생 기록이 필요합니다."),
  })
  .superRefine((value, ctx) => {
    const total = value.vocabTotal ? Number(value.vocabTotal) : null;

    if (total !== null && total <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "단어시험 총 문항 수는 1 이상이어야 해요.",
        path: ["vocabTotal"],
      });
      return;
    }

    for (const [index, student] of value.students.entries()) {
      if (!student.vocabCorrect) {
        continue;
      }

      const correct = Number(student.vocabCorrect);

      if (total === null) {
        ctx.addIssue({
          code: "custom",
          message: "단어시험 점수를 입력하려면 총 문항 수를 먼저 입력해주세요.",
          path: ["students", index, "vocabCorrect"],
        });
      } else if (correct > total) {
        ctx.addIssue({
          code: "custom",
          message: `맞은 개수는 총 문항 수(${total})를 넘을 수 없어요.`,
          path: ["students", index, "vocabCorrect"],
        });
      }
    }
  });

export type DailyLogFormInput = z.infer<typeof dailyLogSchema>;
export type StudentLessonEntryInput = z.infer<typeof studentLessonEntrySchema>;

export const preparationItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1, "준비 항목 내용을 입력해주세요.").max(100, "준비 항목은 100자 이내로 입력해주세요."),
  completed: z.boolean(),
});

export const preparationItemsSchema = z.array(preparationItemSchema).max(30, "준비 항목은 30개까지 만들 수 있어요.");

const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "시간 형식을 확인해주세요.")
  .or(z.literal(""));

export const makeupScheduleSchema = z
  .object({
    scheduledDate: dateString,
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    memo: z.string().trim().max(1000, "메모는 1000자 이내로 입력해주세요.").optional(),
  })
  .refine((value) => !value.startTime === !value.endTime, {
    message: "시작과 종료 시간을 함께 입력해주세요.",
    path: ["endTime"],
  })
  .refine(
    (value) => !value.startTime || !value.endTime || value.startTime < value.endTime,
    { message: "종료 시간은 시작 시간보다 늦어야 해요.", path: ["endTime"] },
  );

export const makeupCompleteSchema = z.object({
  completedDate: dateString,
  completedProgress: shortText(300, "보충한 진도"),
  comment: shortText(1000, "코멘트"),
});
