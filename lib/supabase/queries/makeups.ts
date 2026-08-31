import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { MakeupLessonRecord, StudentRecord } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export type MakeupWithStudent = MakeupLessonRecord & {
  student: Pick<StudentRecord, "id" | "name" | "grade"> | null;
};

export async function getCurrentUserMakeups() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as MakeupWithStudent[];
  }

  const { data, error } = await supabase
    .from("makeup_lessons")
    .select("*, students(id, name, grade)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getCurrentUserMakeups error", error);
    return [] as MakeupWithStudent[];
  }

  return (data ?? []).map((row) => ({
    ...(row as unknown as MakeupLessonRecord),
    student: pickOne<Pick<StudentRecord, "id" | "name" | "grade">>(row.students),
  }));
}

async function getOwnedMakeup(makeupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("makeup_lessons")
    .select("*")
    .eq("id", makeupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getOwnedMakeup error", error);
    throw new Error("보충수업 정보를 불러오지 못했어요.");
  }

  if (!data) {
    throw new Error("보충수업 정보를 찾을 수 없어요.");
  }

  return { supabase, user, makeup: data as MakeupLessonRecord };
}

export async function scheduleMakeup(makeupId: string, scheduledDate: string) {
  const { supabase, user } = await getOwnedMakeup(makeupId);

  const { error } = await supabase
    .from("makeup_lessons")
    .update({ status: "scheduled", scheduled_date: scheduledDate })
    .eq("id", makeupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("scheduleMakeup error", error);
    throw new Error("보충 일정을 저장하지 못했어요.");
  }

  return true;
}

export async function completeMakeup(
  makeupId: string,
  input: { completedDate: string; completedProgress?: string | null; comment?: string | null },
) {
  const { supabase, user } = await getOwnedMakeup(makeupId);

  const { error } = await supabase
    .from("makeup_lessons")
    .update({
      status: "completed",
      completed_date: input.completedDate,
      completed_progress: input.completedProgress?.trim() || null,
      comment: input.comment?.trim() || null,
    })
    .eq("id", makeupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("completeMakeup error", error);
    throw new Error("보충수업을 완료 처리하지 못했어요.");
  }

  return true;
}

export async function cancelMakeup(makeupId: string) {
  const { supabase, user, makeup } = await getOwnedMakeup(makeupId);

  if (makeup.status === "completed") {
    throw new Error("완료된 보충수업은 취소할 수 없어요.");
  }

  const { error } = await supabase
    .from("makeup_lessons")
    .update({ status: "cancelled" })
    .eq("id", makeupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("cancelMakeup error", error);
    throw new Error("보충수업을 취소하지 못했어요.");
  }

  return true;
}
