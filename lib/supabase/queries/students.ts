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
  groupId?: string | null;
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
    })
    .select()
    .single();

  if (studentError || !student) {
    throw new Error("학생을 등록하지 못했어요. 다시 시도해주세요.");
  }

  if (input.groupId) {
    const { error: membershipError } = await supabase.from("student_group_memberships").insert({
      user_id: user.id,
      student_id: student.id,
      group_id: input.groupId,
    });

    if (membershipError) {
      console.error("createStudent membership error", membershipError);
    }
  }

  return student;
}

export async function updateStudent(studentId: string, input: {
  name: string;
  grade: StudentGrade;
  school?: string | null;
  memo?: string | null;
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

export async function getStudentOrThrow(studentId: string) {
  const student = await getStudentByIdForCurrentUser(studentId);

  if (!student) {
    notFound();
  }

  return student;
}
