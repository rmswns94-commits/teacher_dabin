"use server";

import { revalidatePath } from "next/cache";

import {
  createConsultation,
  deleteConsultation,
  getConsultationById,
  updateConsultation,
} from "@/lib/supabase/queries/consultations";
import { getStudentByIdForCurrentUser } from "@/lib/supabase/queries/students";
import {
  consultationFieldsSchema,
  type ConsultationMethod,
  type ConsultationTarget,
} from "@/lib/validation/consultation";

// 상담 기록 저장/수정/삭제.
//
// - 상담은 기록일 뿐이다: 할 일·알림·보충·일지·성장 데이터를 만들거나 바꾸지 않는다.
// - 학생은 화면에서 이미 정해져 있다 — 저장할 때 그 학생이 내 학원 학생인지만 확인한다
//   (다른 학원 학생 id로 상담을 붙이지 못하게 RLS와 별개로 서버에서도 막는다).
// - 수정 시 학생/학원/소유자는 바꾸지 않는다.

type ActionResult = { error: string } | { success: true; id?: string };

type ParsedFields = {
  consultationDate: string;
  consultationTime: string | null;
  target: ConsultationTarget;
  method: ConsultationMethod;
  summary: string;
  content: string;
  followUpNote: string | null;
};

function parse(values: unknown): { ok: false; error: string } | { ok: true; data: ParsedFields } {
  const parsed = consultationFieldsSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요.",
    };
  }

  const data = parsed.data;
  return {
    ok: true,
    data: {
      consultationDate: data.consultationDate,
      consultationTime: data.consultationTime?.trim() ? data.consultationTime : null,
      target: data.target,
      method: data.method,
      // 저장 단계에서만 trim한다 (입력 중에는 건드리지 않아 한글 조합이 끊기지 않는다)
      summary: data.summary,
      content: data.content,
      followUpNote: data.followUpNote?.trim() ? data.followUpNote.trim() : null,
    },
  };
}

// 상담 기록은 학생 상세 화면에서만 본다 — 그 경로만 갱신한다 (전체 캐시 비우기 금지).
function revalidateStudent(studentId: string) {
  revalidatePath(`/students/${studentId}`);
}

export async function createConsultationAction(
  studentId: string,
  values: unknown,
): Promise<ActionResult> {
  const parsed = parse(values);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  // 내 학원 학생인지 확인 (학생 조회 자체가 소유/학원 격리를 거친다)
  const student = await getStudentByIdForCurrentUser(studentId);
  if (!student) {
    return { error: "학생을 찾을 수 없어요." };
  }

  try {
    const id = await createConsultation({ studentId, ...parsed.data });
    revalidateStudent(studentId);
    return { success: true, id };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "상담 기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }
}

export async function updateConsultationAction(
  consultationId: string,
  values: unknown,
): Promise<ActionResult> {
  const parsed = parse(values);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const existing = await getConsultationById(consultationId);
  if (!existing) {
    return { error: "상담 기록을 찾을 수 없어요." };
  }

  try {
    await updateConsultation(consultationId, parsed.data);
    revalidateStudent(existing.student_id);
    return { success: true, id: consultationId };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "상담 기록을 수정하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }
}

export async function deleteConsultationAction(
  consultationId: string,
): Promise<ActionResult> {
  const existing = await getConsultationById(consultationId);
  if (!existing) {
    return { error: "상담 기록을 찾을 수 없어요." };
  }

  try {
    await deleteConsultation(consultationId);
    revalidateStudent(existing.student_id);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "상담 기록을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }
}
