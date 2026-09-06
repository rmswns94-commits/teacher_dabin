import { z } from "zod";

import { gradeValues } from "@/lib/grades";
import type { SchoolExamPrepStatus, SchoolExamType } from "@/lib/supabase/types";

export const examTypeValues = ["midterm", "final", "other"] as const;

export const examTypeLabels: Record<SchoolExamType, string> = {
  midterm: "중간고사",
  final: "기말고사",
  other: "기타 시험",
};

export const semesterLabels: Record<1 | 2, string> = {
  1: "1학기",
  2: "2학기",
};

export const prepStatusValues = ["not_started", "preparing", "ready"] as const;

export const prepStatusLabels: Record<SchoolExamPrepStatus, string> = {
  not_started: "준비 전",
  preparing: "준비 중",
  ready: "준비 완료",
};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해주세요.");

export const schoolExamSchema = z
  .object({
    schoolName: z
      .string()
      .trim()
      .min(1, "학교 이름을 입력해주세요.")
      .max(80, "학교 이름은 80자 이내로 입력해주세요."),
    grade: z.enum(gradeValues, { message: "학년을 선택해주세요." }),
    examYear: z
      .string()
      .regex(/^\d{4}$/, "연도를 확인해주세요.")
      .refine((value) => Number(value) >= 2020 && Number(value) <= 2100, {
        message: "연도를 확인해주세요.",
      }),
    semester: z.enum(["1", "2"], { message: "학기를 선택해주세요." }),
    examType: z.enum(examTypeValues, { message: "시험 종류를 선택해주세요." }),
    startDate: dateString,
    // 종료일은 선택 — 없으면 시작일이 대표 시험일
    endDate: dateString.optional().or(z.literal("")),
    scopeText: z.string().trim().max(2000, "시험 범위는 2000자 이내로 입력해주세요.").optional().or(z.literal("")),
    memo: z.string().trim().max(2000, "메모는 2000자 이내로 입력해주세요.").optional().or(z.literal("")),
    studentIds: z.array(z.string().uuid()).max(100, "학생은 100명까지 선택할 수 있어요."),
  })
  .superRefine((value, ctx) => {
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "시험 종료일은 시작일보다 빠를 수 없어요.",
      });
    }
  });

export type SchoolExamFormInput = z.infer<typeof schoolExamSchema>;
