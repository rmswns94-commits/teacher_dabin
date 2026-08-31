import { notFound } from "next/navigation";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupRecord, StudentGrade, StudentRecord } from "@/lib/supabase/types";

export async function getCurrentUserStudents(includeArchived = false) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as StudentRecord[];
  }

  let query = supabase
    .from("students")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getCurrentUserStudents error", error);
    return [] as StudentRecord[];
  }

  return (data ?? []) as StudentRecord[];
}

export async function getStudentByIdForCurrentUser(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getStudentByIdForCurrentUser error", error);
    return null;
  }

  return data as StudentRecord | null;
}

export async function getStudentGroupsForCurrentUser(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("student_group_memberships")
    .select("group_id, class_groups(*)")
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .not("group_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getStudentGroupsForCurrentUser error", error);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const classGroups = row.class_groups as unknown;
      const group = Array.isArray(classGroups) ? classGroups[0] : classGroups;
      return group as ClassGroupRecord | null;
    })
    .filter(Boolean) as ClassGroupRecord[];
}

export async function createStudent(input: {
  name: string;
  grade: StudentGrade;
  school?: string | null;
  memo?: string | null;
  gender?: "male" | "female" | null;
  birthDate?: string | null;
  groupIds?: string[];
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      grade: input.grade,
      school: input.school?.trim() || null,
      memo: input.memo?.trim() || null,
      gender: input.gender || null,
      birth_date: input.birthDate || null,
    })
    .select()
    .single();

  if (studentError || !student) {
    console.error("createStudent error", studentError);
    throw new Error("학생을 등록하지 못했어요. 다시 시도해주세요.");
  }

  const groupIds = [...new Set(input.groupIds ?? [])];

  if (groupIds.length > 0) {
    const { error: membershipError } = await supabase.from("student_group_memberships").insert(
      groupIds.map((groupId) => ({
        user_id: user.id,
        student_id: student.id,
        group_id: groupId,
      })),
    );

    if (membershipError) {
      // 학생 자체는 등록됐으므로 되돌리지 않고 명확하게 알려준다.
      console.error("createStudent membership error", membershipError);
      throw new Error("학생은 등록됐지만 반 배정에 실패했어요. 학생 상세에서 다시 배정해주세요.");
    }
  }

  return student;
}

// 반별 명단 구성용: 현재 사용자의 모든 membership을 한 번에 가져온다.
export async function getCurrentUserMemberships() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as { student_id: string; group_id: string }[];
  }

  const { data, error } = await supabase
    .from("student_group_memberships")
    .select("student_id, group_id")
    .eq("user_id", user.id);

  if (error) {
    console.error("getCurrentUserMemberships error", error);
    return [] as { student_id: string; group_id: string }[];
  }

  return (data ?? []) as { student_id: string; group_id: string }[];
}

export async function updateStudent(studentId: string, input: {
  name: string;
  grade: StudentGrade;
  school?: string | null;
  memo?: string | null;
  gender?: "male" | "female" | null;
  birthDate?: string | null;
  groupId?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingStudent) {
    throw new Error("학생 정보를 찾을 수 없어요.");
  }

  const { error: updateError } = await supabase
    .from("students")
    .update({
      name: input.name.trim(),
      grade: input.grade,
      school: input.school?.trim() || null,
      memo: input.memo?.trim() || null,
      gender: input.gender || null,
      birth_date: input.birthDate || null,
    })
    .eq("id", studentId)
    .eq("user_id", user.id);

  if (updateError) {
    throw new Error("학생 정보를 수정하지 못했어요.");
  }

  if (input.groupId) {
    const { data: existingMembership } = await supabase
      .from("student_group_memberships")
      .select("id")
      .eq("student_id", studentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMembership) {
      await supabase
        .from("student_group_memberships")
        .update({ group_id: input.groupId })
        .eq("id", existingMembership.id)
        .eq("user_id", user.id);
    } else {
      await supabase.from("student_group_memberships").insert({
        user_id: user.id,
        student_id: studentId,
        group_id: input.groupId,
      });
    }
  }

  return true;
}

export async function archiveStudent(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("students")
    .update({ archived: true })
    .eq("id", studentId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error("학생을 보관하지 못했어요.");
  }

  return true;
}

export async function restoreStudent(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("students")
    .update({ archived: false })
    .eq("id", studentId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error("학생을 복원하지 못했어요.");
  }

  return true;
}

// 학생 완전 삭제. 수업 기록/보충 기록이 FK(restrict)로 연결되어 있어
// 보충 → 학생별 수업 기록 → 학생 순서로 지운다 (멤버십은 cascade).
export async function deleteStudent(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: existing } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("학생 정보를 찾을 수 없어요.");
  }

  const { error: makeupError } = await supabase
    .from("makeup_lessons")
    .delete()
    .eq("student_id", studentId)
    .eq("user_id", user.id);

  if (makeupError) {
    console.error("deleteStudent makeup error", makeupError);
    throw new Error("학생의 보충 기록을 삭제하지 못했어요.");
  }

  const { error: lessonError } = await supabase
    .from("student_lesson_logs")
    .delete()
    .eq("student_id", studentId)
    .eq("user_id", user.id);

  if (lessonError) {
    console.error("deleteStudent lesson error", lessonError);
    throw new Error("학생의 수업 기록을 삭제하지 못했어요.");
  }

  const { error } = await supabase
    .from("students")
    .delete()
    .eq("id", studentId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteStudent error", error);
    throw new Error("학생을 삭제하지 못했어요.");
  }

  return true;
}

export async function getStudentOrThrow(studentId: string) {
  const student = await getStudentByIdForCurrentUser(studentId);

  if (!student) {
    notFound();
  }

  return student;
}
