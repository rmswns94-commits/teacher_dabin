"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createSchoolExam,
  deleteSchoolExam,
  updateSchoolExam,
  updateSchoolExamPrepStatus,
} from "@/lib/supabase/queries/school-exams";
import { schoolExamSchema, type SchoolExamFormInput } from "@/lib/validation/school-exam";

type ActionResult = { error: string } | { success: true };

// 시험 날짜의 single source가 calendar_events라 캘린더/대시보드 화면도 함께 갱신한다.
function revalidateExamViews(examId?: string) {
  revalidatePath("/exams");
  if (examId) {
    revalidatePath(`/exams/${examId}`);
  }
  revalidatePath("/daily-logs"); // 캘린더 일정 lane
  revalidatePath("/dashboard"); // D-30 시험 카드
}

function toWriteInput(parsed: SchoolExamFormInput) {
  return {
    schoolName: parsed.schoolName,
    grade: parsed.grade,
    examYear: Number(parsed.examYear),
    semester: Number(parsed.semester) as 1 | 2,
    examType: parsed.examType,
    startDate: parsed.startDate,
    endDate: parsed.endDate || null,
    scopeText: parsed.scopeText || null,
    memo: parsed.memo || null,
    studentIds: parsed.studentIds,
  };
}

export async function createSchoolExamAction(values: unknown): Promise<ActionResult> {
  const parsed = schoolExamSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  try {
    await createSchoolExam(toWriteInput(parsed.data));
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "시험을 등록하지 못했어요.",
    };
  }

  revalidateExamViews();
  return { success: true };
}

export async function updateSchoolExamAction(examId: string, values: unknown): Promise<ActionResult> {
  const parsed = schoolExamSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  try {
    await updateSchoolExam(examId, toWriteInput(parsed.data));
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "시험을 수정하지 못했어요.",
    };
  }

  revalidateExamViews(examId);
  return { success: true };
}

export async function updateSchoolExamPrepStatusAction(
  examId: string,
  prepStatus: string,
): Promise<ActionResult> {
  if (!["not_started", "preparing", "ready"].includes(prepStatus)) {
    return { error: "준비 상태 값을 확인해주세요." };
  }

  try {
    await updateSchoolExamPrepStatus(examId, prepStatus as "not_started" | "preparing" | "ready");
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "준비 상태를 바꾸지 못했어요.",
    };
  }

  revalidateExamViews(examId);
  return { success: true };
}

// 삭제는 underlying calendar event까지 함께 (client에서 confirm을 거친 뒤 호출)
export async function deleteSchoolExamAction(examId: string): Promise<{ error: string } | never> {
  try {
    await deleteSchoolExam(examId);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "시험을 삭제하지 못했어요.",
    };
  }

  revalidateExamViews();
  redirect("/exams?deleted=1");
}
