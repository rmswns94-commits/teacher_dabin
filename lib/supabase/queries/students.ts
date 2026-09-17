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

// 학생 정보 수정 + 소속 그룹 다중 동기화 (Edit Dialog용).
// membership은 선택 집합과 비교해 추가/제거만 수행한다 (전체 delete+insert 아님).
export async function updateStudentWithGroups(studentId: string, input: {
  name: string;
  grade: StudentGrade;
  school?: string | null;
  memo?: string | null;
  gender?: "male" | "female" | null;
  birthDate?: string | null;
  groupIds: string[];
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
    console.error("updateStudentWithGroups update error", updateError);
    throw new Error("학생 정보를 수정하지 못했어요.");
  }

  // membership 동기화 (batch 조회 1번 + 필요한 insert/delete만)
  const selected = new Set(input.groupIds);
  const { data: memberships, error: membershipError } = await supabase
    .from("student_group_memberships")
    .select("id, group_id")
    .eq("user_id", user.id)
    .eq("student_id", studentId);

  if (membershipError) {
    console.error("updateStudentWithGroups membership read error", membershipError);
    throw new Error("학생 정보는 수정했지만 수업 그룹을 확인하지 못했어요.");
  }

  const current = new Set((memberships ?? []).map((row) => row.group_id as string));
  const toAdd = [...selected].filter((groupId) => !current.has(groupId));
  const toRemove = (memberships ?? [])
    .filter((row) => !selected.has(row.group_id as string))
    .map((row) => row.id as string);

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("student_group_memberships")
      .delete()
      .eq("user_id", user.id)
      .in("id", toRemove);

    if (error) {
      console.error("updateStudentWithGroups membership remove error", error);
      throw new Error("학생 정보는 수정했지만 수업 그룹 변경에 실패했어요.");
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("student_group_memberships").insert(
      toAdd.map((groupId) => ({ user_id: user.id, student_id: studentId, group_id: groupId })),
    );

    if (error) {
      console.error("updateStudentWithGroups membership add error", error);
      throw new Error("학생 정보는 수정했지만 수업 그룹 변경에 실패했어요.");
    }
  }

  return true;
}

// 재원/휴원/퇴원 상태 변경 — hard delete가 아니다. 학생 row/과거 기록은 전부 보존되고,
// 현재 roster 제외는 기존 archived 마스터 플래그로 동작한다 (휴원·퇴원 = archived=true).
// status 컬럼 migration(20260917) 미적용 환경에서는 update가 실패하고 에러를 던진다
// (거짓 성공 없음 — UI가 "변경하지 못했어요"로 안내).
export async function setStudentLifecycleStatus(
  studentId: string,
  status: "active" | "paused" | "withdrawn",
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("students")
    .update({ archived: status !== "active", status })
    .eq("id", studentId)
    .eq("user_id", user.id);

  if (error) {
    console.error("setStudentLifecycleStatus error", error);
    throw new Error("학생 상태를 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return true;
}

// 반 이동 — 현재 membership만 바꾼다 (과거 일지의 group_id는 절대 변경하지 않는다).
// multi-group 안전: 지정한 source membership 하나만 종료하고 다른 소속은 유지.
// 순서: target insert 먼저(실패 시 아무 변화 없음) → source delete.
// target에 이미 소속이면(unique 위반) 그대로 인정하고 source만 제거한다.
export async function transferStudentGroup(
  studentId: string,
  fromGroupId: string,
  toGroupId: string,
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (fromGroupId === toGroupId) {
    throw new Error("같은 반으로는 이동할 수 없어요.");
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

  const { error: insertError } = await supabase
    .from("student_group_memberships")
    .insert({ user_id: user.id, student_id: studentId, group_id: toGroupId });

  // 23505 = 이미 target 소속 (동시 클릭/기존 소속) — 이동 목적상 정상으로 취급
  if (insertError && insertError.code !== "23505") {
    console.error("transferStudentGroup insert error", insertError);
    throw new Error("반 이동을 하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  const { error: deleteError } = await supabase
    .from("student_group_memberships")
    .delete()
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .eq("group_id", fromGroupId);

  if (deleteError) {
    // target 소속은 이미 생겼고 source 종료만 실패 — 데이터 손실 없는 상태(양쪽 소속).
    console.error("transferStudentGroup delete error", deleteError);
    throw new Error("새 반 배정은 됐지만 기존 반 정리에 실패했어요. 학생 정보에서 확인해주세요.");
  }

  return true;
}

// 학기·학년 전환 batch 적용 — 현재 학년/현재 소속만, 한 번의 RPC = 단일 트랜잭션.
// 부분 적용(절반만 새 학년) 방지가 목적이라 학생별 순차 update를 쓰지 않는다.
// 함수는 내부에서 auth.uid()만 사용하므로 다른 교사의 학생/그룹은 변경할 수 없다.
// migration(20260918_add_academic_transition_rpc) 미적용 환경에서는 에러를 던진다
// (거짓 성공 없음 — UI가 "전환하지 못했어요"로 안내).
export async function applyAcademicTransition(
  changes: {
    studentId: string;
    grade: string | null;
    fromGroupId: string | null;
    toGroupId: string | null;
  }[],
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (changes.length === 0) {
    return 0;
  }

  const { data, error } = await supabase.rpc("apply_academic_transition", {
    p_changes: changes.map((change) => ({
      student_id: change.studentId,
      grade: change.grade,
      from_group_id: change.fromGroupId,
      to_group_id: change.toGroupId,
    })),
  });

  if (error) {
    console.error("applyAcademicTransition error", error);
    throw new Error("새 학기 정보를 적용하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return typeof data === "number" ? data : changes.length;
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
