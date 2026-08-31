"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createStudent, updateStudent, archiveStudent, restoreStudent } from "@/lib/supabase/queries/students";
import { studentSchema } from "@/lib/validation/student";

export async function createStudentAction(formData: FormData) {
  const payload = {
    name: String(formData.get("name") ?? ""),
    grade: String(formData.get("grade") ?? ""),
    school: String(formData.get("school") ?? ""),
    memo: String(formData.get("memo") ?? ""),
    groupId: String(formData.get("groupId") ?? ""),
  };

  const parsed = studentSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "학생 정보를 다시 확인해주세요.");
  }

  const student = await createStudent({
    name: parsed.data.name,
    grade: parsed.data.grade as "middle_1" | "middle_2" | "middle_3" | "high_1",
    school: parsed.data.school || null,
    memo: parsed.data.memo || null,
    groupId: parsed.data.groupId || null,
  });

  revalidatePath("/students");
  redirect(`/students/${student.id}`);
}

export async function updateStudentAction(studentId: string, formData: FormData) {
  const payload = {
    name: String(formData.get("name") ?? ""),
    grade: String(formData.get("grade") ?? ""),
    school: String(formData.get("school") ?? ""),
    memo: String(formData.get("memo") ?? ""),
    groupId: String(formData.get("groupId") ?? ""),
  };

  const parsed = studentSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "학생 정보를 다시 확인해주세요.");
  }

  await updateStudent(studentId, {
    name: parsed.data.name,
    grade: parsed.data.grade as "middle_1" | "middle_2" | "middle_3" | "high_1",
    school: parsed.data.school || null,
    memo: parsed.data.memo || null,
    groupId: parsed.data.groupId || null,
  });

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}`);
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
