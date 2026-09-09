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
  attendance: z.enum(["present", "late", "absent", "early_leave"], {
    message: "출결 상태를 확인해주세요.",
  }),
  progress: shortText(300, "진도"),
  strengths: shortText(1000, "잘한 부분"),
  improvements: shortText(1000, "보완할 부분"),
  memo: shortText(1000, "메모"),
  // 여러 줄 입력 지원 — trim은 앞뒤 공백만, 내부 \n은 보존된다
  missedProgress: shortText(1000, "놓친 진도"),
  needsMakeup: z.boolean(),
  makeupScheduledDate: dateString.optional().or(z.literal("")),
  // 학생 평가 quick check — 모든 학년 공통 (전부 optional — 입력 안 한 값은 null로 저장)
  homeworkStatus: z.enum(["completed", "partial", "missing"]).optional().or(z.literal("")),
  vocabCorrect: numberString.optional().or(z.literal("")),
  vocabRetest: z.boolean().optional(),
  // 단어시험 틀린 단어: 빈 문자열/같은 시험 내 중복(정규화 기준)은 서버에서 걸러 저장된다.
  vocabMistakes: z
    .array(z.string().trim().max(60, "단어는 60자 이내로 입력해주세요."))
    .max(50, "틀린 단어는 시험당 50개까지 기록할 수 있어요.")
    .optional(),
  focusLevel: z.enum(["good", "normal", "distracted"]).optional().or(z.literal("")),
  participationLevel: z.enum(["active", "normal", "passive"]).optional().or(z.literal("")),
  parentNoteNeeded: z.boolean().optional(),
  parentNote: shortText(1000, "학부모 전달 내용"),
  // 칭찬 한표: 한 수업에서 여러 개 가능. 빈 문자열은 서버에서 걸러져 저장되지 않는다.
  praiseComments: z
    .array(z.string().trim().max(120, "칭찬은 120자 이내로 입력해주세요."))
    .max(20, "칭찬은 수업당 20개까지 기록할 수 있어요.")
    .optional(),
  questionLevel: z.enum(["high", "normal", "low"]).optional().or(z.literal("")),
  kindnessLevel: z.enum(["good", "normal", "poor"]).optional().or(z.literal("")),
  effortLevel: z.enum(["high", "normal", "low"]).optional().or(z.literal("")),
});

// 오늘 숙제(구조화) — 항목마다 내용+완료일 필수, 내용은 여러 줄 가능(trim은 가장자리만).
// textbook: 연결 교재 이름 스냅샷 (선택 — "교재 없음"은 빈 문자열)
export const homeworkAssignmentSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  content: z
    .string()
    .trim()
    .min(1, "숙제 내용을 입력해주세요.")
    .max(500, "숙제 내용은 500자 이내로 입력해주세요."),
  dueDate: dateString,
  textbook: shortText(100, "숙제 교재"),
  // 시험 기간 ON 당시 학교 context (textbook과 배타적 — 폼이 한쪽만 채운다)
  school: shortText(100, "숙제 학교"),
});

// 교재별 섹션(진도/다음 수업 계획) — 작성 시점 교재 이름 스냅샷 + 여러 줄 내용
export const textbookSectionSchema = z.object({
  name: z.string().trim().min(1).max(100, "교재 이름이 너무 길어요."),
  text: z.string().trim().max(2000, "내용은 2000자 이내로 입력해주세요."),
});

// 해야 할 일 항목 — stable id + 교재/날짜 optional, 내용 필수(빈 항목은 폼에서 제외)
export const dailyLogTaskSchema = z.object({
  id: z.string().min(1),
  textbook: shortText(100, "해야 할 일 교재"),
  school: shortText(100, "해야 할 일 학교"),
  content: z
    .string()
    .trim()
    .min(1, "해야 할 일 내용을 입력해주세요.")
    .max(1000, "해야 할 일은 1000자 이내로 입력해주세요."),
  dueDate: dateString.optional().or(z.literal("")),
});

export const dailyLogSchema = z
  .object({
    dailyLogId: z.string().uuid().optional(),
    classDate: dateString,
    groupId: z.string().uuid({ message: "수업 그룹을 선택해주세요." }),
    title: shortText(120, "수업 제목"),
    // 공통 진도가 canonical field (수업 내용 통합 후 여러 줄 작성 — 넉넉한 상한)
    defaultProgress: shortText(4000, "공통 진도"),
    memo: shortText(1000, "메모"),
    homework: shortText(1000, "오늘 숙제"),
    homeworkDueDate: dateString.optional().or(z.literal("")),
    // 교재별 계획 mirror가 합성되므로 단일 필드보다 넉넉한 상한
    nextLessonPlan: shortText(4000, "다음 수업 계획"),
    nextPlanDate: dateString.optional().or(z.literal("")),
    // 해야 할 일 — 다음 수업 계획과 별개인 Teacher 작업 (final 완료 시 공용 Todo 1개로 연결)
    taskContent: shortText(1000, "해야 할 일"),
    taskDate: dateString.optional().or(z.literal("")),
    taskTextbook: shortText(100, "해야 할 일 교재"),
    // 해야 할 일 다중 항목 (개수 제한은 Todo 상한 정책과 별개 — 넉넉히)
    tasks: z.array(dailyLogTaskSchema).max(50, "해야 할 일은 50개까지 기록할 수 있어요.").optional(),
    // 교재별 진도/다음 수업 계획 스냅샷 (내용이 있는 교재만 전송)
    textbookProgress: z.array(textbookSectionSchema).max(20).optional(),
    textbookPlans: z.array(textbookSectionSchema).max(20).optional(),
    // 학교 context 다음 수업 계획 (시험 기간 ON — name=학교명)
    schoolPlans: z.array(textbookSectionSchema).max(20).optional(),
    vocabTotal: numberString.optional().or(z.literal("")),
    // 수업 회고 (강사 자기 성찰) — 전부 선택 입력
    reflectionGood: shortText(1000, "잘된 점"),
    reflectionHard: shortText(1000, "아쉬웠던 점"),
    reflectionNext: shortText(1000, "다음에 다르게 해볼 것"),
    status: z.enum(["draft", "completed"], { message: "저장 상태를 확인해주세요." }),
    // 오늘 숙제(구조화) — 숙제 N개, 각각 독립 완료일
    homeworkAssignments: z
      .array(homeworkAssignmentSchema)
      .max(20, "숙제는 한 수업에 20개까지 기록할 수 있어요.")
      .optional(),
    students: z.array(studentLessonEntrySchema).min(1, "학생 기록이 필요합니다."),
  })
  .superRefine((value, ctx) => {
    // 구조화 숙제 완료일은 기존 숙제 날짜와 같은 규칙: 수업일 이후
    for (const [index, assignment] of (value.homeworkAssignments ?? []).entries()) {
      if (assignment.dueDate <= value.classDate) {
        ctx.addIssue({
          code: "custom",
          path: ["homeworkAssignments", index, "dueDate"],
          message: "숙제 완료일은 수업일 이후로 선택해주세요.",
        });
      }
    }
    // 다음 수업 계획은 내용+날짜 한 쌍으로 관리한다
    if ((value.nextLessonPlan ?? "").trim() && !value.nextPlanDate) {
      ctx.addIssue({ code: "custom", path: ["nextPlanDate"], message: "다음 수업 계획 날짜를 선택해주세요." });
    }
    if (value.nextPlanDate && value.nextPlanDate <= value.classDate) {
      ctx.addIssue({ code: "custom", path: ["nextPlanDate"], message: "다음 수업 계획 날짜는 수업일 이후로 선택해주세요." });
    }
    // 숙제 날짜는 선택 사항 — 골랐다면 수업일 이후여야 그 날 To Do로 뜬다
    if (value.homeworkDueDate && value.homeworkDueDate <= value.classDate) {
      ctx.addIssue({ code: "custom", path: ["homeworkDueDate"], message: "숙제 날짜는 수업일 이후로 선택해주세요." });
    }
    // 해야 할 일은 내용+날짜 한 쌍 (당일 준비도 가능하므로 수업일 당일부터 허용)
    if ((value.taskContent ?? "").trim() && !value.taskDate) {
      ctx.addIssue({ code: "custom", path: ["taskDate"], message: "해야 할 일 날짜를 선택해주세요." });
    }
    if (value.taskDate && value.taskDate < value.classDate) {
      ctx.addIssue({ code: "custom", path: ["taskDate"], message: "해야 할 일 날짜는 수업일부터 선택할 수 있어요." });
    }
    // 다중 해야 할 일: 날짜는 선택 사항 — 골랐다면 수업일 당일부터 (비우면 수업일+1)
    for (const [index, task] of (value.tasks ?? []).entries()) {
      if (task.dueDate && task.dueDate < value.classDate) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "dueDate"],
          message: "해야 할 일 날짜는 수업일부터 선택할 수 있어요.",
        });
      }
    }

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
  // .trim()은 가장자리만 — 내부 줄바꿈(\n)은 유지된다 (여러 줄 할 일)
  text: z.string().trim().min(1, "준비 항목 내용을 입력해주세요.").max(300, "준비 항목은 300자 이내로 입력해주세요."),
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

// 보충 탭 직접 등록 (결석 연동 없이 학생/그룹/날짜/시간을 Teacher가 지정)
export const manualMakeupSchema = z
  .object({
    studentId: z.string().uuid({ message: "학생을 선택해주세요." }),
    groupId: z.string().uuid().optional().or(z.literal("")),
    scheduledDate: dateString,
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    memo: z.string().trim().max(1000, "메모는 1000자 이내로 입력해주세요.").optional().or(z.literal("")),
  })
  .refine((value) => !value.startTime === !value.endTime, {
    message: "시작과 종료 시간을 함께 입력해주세요.",
    path: ["endTime"],
  })
  .refine(
    (value) => !value.startTime || !value.endTime || value.startTime < value.endTime,
    { message: "종료 시간은 시작 시간보다 늦어야 해요.", path: ["endTime"] },
  );

export type ManualMakeupInput = z.infer<typeof manualMakeupSchema>;

export const makeupCompleteSchema = z.object({
  completedDate: dateString,
  completedProgress: shortText(300, "보충한 진도"),
  comment: shortText(1000, "코멘트"),
});

// 이전 수업 기록 패널의 공통 필드 수정 (학생 평가/칭찬은 기존 전체 수정 화면 재사용)
export const historyLogUpdateSchema = z.object({
  dailyLogId: z.string().uuid(),
  title: shortText(120, "수업 제목"),
  defaultProgress: shortText(4000, "공통 진도"),
  memo: shortText(1000, "메모"),
  homework: shortText(1000, "오늘 숙제"),
  homeworkDueDate: dateString.optional().or(z.literal("")),
  nextLessonPlan: shortText(1000, "다음 수업 계획"),
  nextPlanDate: dateString.optional().or(z.literal("")),
});

export type HistoryLogUpdateInput = z.infer<typeof historyLogUpdateSchema>;
