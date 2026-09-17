"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyAcademicTransition,
  createStudent,
  deleteStudent,
  updateStudentWithGroups,
  archiveStudent,
  restoreStudent,
  setStudentLifecycleStatus,
  transferStudentGroup,
} from "@/lib/supabase/queries/students";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
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

// 학생 상세의 Edit Dialog에서 사용. 성공 시 상세에 머물며 즉시 반영된다.
export async function updateStudentDetailsAction(
  studentId: string,
  values: {
    name: string;
    grade: string;
    school: string;
    memo: string;
    gender: string;
    birthDate: string;
    groupIds: string[];
  },
): Promise<{ error: string } | { success: true }> {
  const parsed = studentSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "학생 정보를 다시 확인해주세요." };
  }

  try {
    await updateStudentWithGroups(studentId, {
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
      error:
        error instanceof Error && error.message ? error.message : "학생 정보를 수정하지 못했어요.",
    };
  }

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/groups");
  revalidatePath("/dashboard");
  revalidatePath("/growth-notes", "layout");
  return { success: true };
}

// 학생 완전 삭제 (수업/보충 기록 포함). 클라이언트에서 확인을 거친 뒤 호출된다.
export async function deleteStudentAction(studentId: string): Promise<{ error: string } | never> {
  try {
    await deleteStudent(studentId);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "학생을 삭제하지 못했어요.",
    };
  }

  revalidatePath("/students");
  revalidatePath("/groups");
  revalidatePath("/dashboard");
  redirect("/students?deleted=1");
}

// 학부모 전달 완료 처리 (기록은 남기고 상태만 completed로)
export async function completeParentNoteAction(lessonLogId: string, studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_lesson_logs")
    .update({ parent_note_status: "completed", parent_note_completed_at: new Date().toISOString() })
    .eq("id", lessonLogId)
    .eq("user_id", user.id)
    .eq("parent_note_status", "pending");

  if (error) {
    console.error("completeParentNoteAction error", error);
    throw new Error("전달 완료 처리를 하지 못했어요.");
  }

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
}

// 상태 변경 후 학생 목록/상세/그룹/성장/대시보드가 새 roster를 보게 revalidate.
// (일지 작성/편집 화면은 dynamic이라 다음 진입 시 항상 최신)
function revalidateStudentSurfaces(studentId: string) {
  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/groups", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/growth-notes", "layout");
}

// 재원/휴원/퇴원 — soft status 전환 (삭제 아님). 클라이언트 확인 dialog를 거친 뒤 호출.
export async function setStudentStatusAction(
  studentId: string,
  status: "active" | "paused" | "withdrawn",
): Promise<{ error: string } | { success: true }> {
  if (!["active", "paused", "withdrawn"].includes(status)) {
    return { error: "잘못된 상태예요." };
  }

  try {
    await setStudentLifecycleStatus(studentId, status);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "학생 상태를 변경하지 못했어요.",
    };
  }

  revalidateStudentSurfaces(studentId);
  return { success: true };
}

// 반 이동 — 지정한 source membership만 종료하고 target membership을 만든다.
// 과거 일지의 group_id/기록은 변경하지 않는다 (현재 roster만 변경).
export async function transferStudentGroupAction(
  studentId: string,
  fromGroupId: string,
  toGroupId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await transferStudentGroup(studentId, fromGroupId, toGroupId);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "반 이동을 하지 못했어요.",
    };
  }

  revalidateStudentSurfaces(studentId);
  return { success: true };
}

// 학기·학년 전환 — 마법사의 최종 [적용]에서만 호출된다 (미리보기까지 DB 호출 0).
// 변경안 전체를 한 RPC(단일 트랜잭션)로 보내 부분 적용을 막는다.
export async function applyAcademicTransitionAction(
  changes: {
    studentId: string;
    grade: string | null;
    fromGroupId: string | null;
    toGroupId: string | null;
  }[],
): Promise<{ error: string } | { success: true; applied: number }> {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { error: "적용할 변경사항이 없어요." };
  }

  let applied = 0;

  try {
    applied = await applyAcademicTransition(changes);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "새 학기 정보를 적용하지 못했어요.",
    };
  }

  revalidatePath("/students");
  for (const change of changes) {
    revalidatePath(`/students/${change.studentId}`);
  }
  revalidatePath("/groups", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/growth-notes", "layout");
  return { success: true, applied };
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
