"use server";

import { revalidatePath } from "next/cache";

import {
  createStudentWeakness,
  deleteStudentWeakness,
  reopenStudentWeakness,
  resolveStudentWeakness,
  updateStudentWeakness,
} from "@/lib/supabase/queries/weaknesses";
import { weaknessCreateSchema, weaknessFieldsSchema } from "@/lib/validation/weakness";

type ActionResult = { error: string } | { success: true };

// 약점 노트는 학생 상세와 Dashboard 복습 큐에 보인다.
function revalidateWeaknessViews(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/dashboard");
}

// 학생 상세의 [+ 약점 기록]과 수업일지의 [약점 기록 +]이 함께 쓰는 공용 등록 액션.
// Teacher가 명시적으로 등록한 것만 저장된다 — 관찰값 기반 자동 생성 없음.
export async function createStudentWeaknessAction(values: {
  studentId: string;
  groupId: string;
  sourceDailyLogId: string;
  category: string;
  title: string;
  note: string;
  reviewDueDate: string;
}): Promise<ActionResult> {
  const parsed = weaknessCreateSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "약점 내용을 다시 확인해주세요." };
  }

  try {
    await createStudentWeakness({
      studentId: parsed.data.studentId,
      groupId: parsed.data.groupId || null,
      sourceDailyLogId: parsed.data.sourceDailyLogId || null,
      category: parsed.data.category,
      title: parsed.data.title,
      note: parsed.data.note || null,
      reviewDueDate: parsed.data.reviewDueDate || null,
    });
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "약점을 기록하지 못했어요.",
    };
  }

  revalidateWeaknessViews(parsed.data.studentId);
  return { success: true };
}

// 수정 + "다시 확인" 날짜 재지정 공용 (예: 9/8 다시 봤는데 아직 부족 → 9/11로 변경).
export async function updateStudentWeaknessAction(
  weaknessId: string,
  studentId: string,
  values: { category: string; title: string; note: string; reviewDueDate: string },
): Promise<ActionResult> {
  const parsed = weaknessFieldsSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "약점 내용을 다시 확인해주세요." };
  }

  try {
    await updateStudentWeakness(weaknessId, {
      category: parsed.data.category,
      title: parsed.data.title,
      note: parsed.data.note || null,
      reviewDueDate: parsed.data.reviewDueDate || null,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "약점 기록을 수정하지 못했어요.",
    };
  }

  revalidateWeaknessViews(studentId);
  return { success: true };
}

export async function resolveStudentWeaknessAction(
  weaknessId: string,
  studentId: string,
): Promise<ActionResult> {
  try {
    await resolveStudentWeakness(weaknessId);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "확인 완료 처리를 하지 못했어요.",
    };
  }

  revalidateWeaknessViews(studentId);
  return { success: true };
}

export async function reopenStudentWeaknessAction(
  weaknessId: string,
  studentId: string,
): Promise<ActionResult> {
  try {
    await reopenStudentWeakness(weaknessId);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "약점 기록을 다시 열지 못했어요.",
    };
  }

  revalidateWeaknessViews(studentId);
  return { success: true };
}

export async function deleteStudentWeaknessAction(
  weaknessId: string,
  studentId: string,
): Promise<ActionResult> {
  try {
    await deleteStudentWeakness(weaknessId);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "약점 기록을 삭제하지 못했어요.",
    };
  }

  revalidateWeaknessViews(studentId);
  return { success: true };
}
