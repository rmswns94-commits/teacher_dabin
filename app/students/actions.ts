"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createStudent, updateStudent, archiveStudent, restoreStudent } from "@/lib/supabase/queries/students";
import { studentSchema } from "@/lib/validation/student";

// 학생 목록 페이지의 등록 다이얼로그에서 사용. 성공 시 목록에 머문다.
export async function createStudentAction(values: {
  name: string;
  grade: string;
  school: string;
  memo: string;
  gender: string;
  birthDate: string;
  groupIds: string[];
}): Promise<{ error: string } | { success: true }> {
  const parsed = studentSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "학생 정보를 다시 확인해주세요." };
  }

  try {
    await createStudent({
      name: parsed.data.name,
      grade: parsed.data.grade,
      school: parsed.data.school || null,
      memo: parsed.data.memo || null,
      gender: parsed.data.gender || null,
      birthDate: parsed.data.birthDate || null,
      groupIds: parsed.data.groupIds ?? [],
    });
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "학생을 등록하지 못했어요.",
    };
  }

  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  return { success: true };
}

export async function updateStudentAction(studentId: string, formData: FormData) {
  const payload = {
    name: String(formData.get("name") ?? ""),
    grade: String(formData.get("grade") ?? ""),
    school: String(formData.get("school") ?? ""),
    memo: String(formData.get("memo") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    groupId: String(formData.get("groupId") ?? ""),
  };

  const parsed = studentSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "학생 정보를 다시 확인해주세요.");
  }

  await updateStudent(studentId, {
    name: parsed.data.name,
    grade: parsed.data.grade,
    school: parsed.data.school || null,
    memo: parsed.data.memo || null,
    gender: parsed.data.gender || null,
    birthDate: parsed.data.birthDate || null,
    groupId: parsed.data.groupId || null,
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}?saved=1`);
}

export async function archiveStudentAction(studentId: string) {
  await archiveStudent(studentId);
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  redirect("/students");
}

export async function restoreStudentAction(studentId: string) {
  await restoreStudent(studentId);
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  redirect("/students");
}
