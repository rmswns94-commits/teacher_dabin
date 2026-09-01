import { cache } from "react";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupRecord, MakeupLessonRecord, StudentRecord } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export type MakeupWithStudent = MakeupLessonRecord & {
  student: Pick<StudentRecord, "id" | "name" | "grade"> | null;
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
  dailyLogId: string | null;
};

// 보충 목록 + 학생 + (결석 일지를 거쳐) 그룹까지 relation embed 쿼리 1번.
// 보충 1건마다 학생/그룹/일지를 따로 조회하지 않는다 (N+1 금지).
export async function getCurrentUserMakeups() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as MakeupWithStudent[];
  }

  const { data, error } = await supabase
    .from("makeup_lessons")
    .select(
      "*, students(id, name, grade), student_lesson_logs(daily_log_id, daily_logs(id, class_groups(id, name)))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getCurrentUserMakeups error", error);
    return [] as MakeupWithStudent[];
  }

  return (data ?? []).map((row) => {
    const lessonLog = pickOne<{ daily_log_id: string | null; daily_logs: unknown }>(
      row.student_lesson_logs,
    );
    const dailyLog = pickOne<{ id: string; class_groups: unknown }>(lessonLog?.daily_logs);

    return {
      ...(row as unknown as MakeupLessonRecord),
      student: pickOne<Pick<StudentRecord, "id" | "name" | "grade">>(row.students),
      group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(dailyLog?.class_groups),
      dailyLogId: dailyLog?.id ?? null,
    };
  });
}

// 사이드바 badge용: 아직 일정을 못 잡은 보충(required) 개수만 head count.
// cache()라 같은 요청 안에서 여러 번 불러도 쿼리는 1번.
export const getPendingMakeupCount = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return 0;
  }

  const { count, error } = await supabase
    .from("makeup_lessons")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "required");

  if (error) {
    console.error("getPendingMakeupCount error", error);
    return 0;
  }

  return count ?? 0;
});

export type MonthlyMakeupMarker = {
  id: string;
  scheduled_date: string;
  start_time: string | null;
  missed_progress: string | null;
  student: Pick<StudentRecord, "id" | "name"> | null;
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
};

// 캘린더용: 해당 월과 겹치는 scheduled 보충만 조회 (전체 history 조회 금지).
// makeup record 자체가 source of truth — calendar_events에 복제하지 않는다.
export async function getMonthlyScheduledMakeups(monthStart: string, monthEnd: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as MonthlyMakeupMarker[];
  }

  const { data, error } = await supabase
    .from("makeup_lessons")
    .select(
      "id, scheduled_date, start_time, missed_progress, students(id, name), student_lesson_logs(daily_logs(class_groups(id, name)))",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .gte("scheduled_date", monthStart)
    .lte("scheduled_date", monthEnd)
    .order("scheduled_date", { ascending: true });

  if (error) {
    console.error("getMonthlyScheduledMakeups error", error);
    return [] as MonthlyMakeupMarker[];
  }

  return (data ?? []).map((row) => {
    const lessonLog = pickOne<{ daily_logs: unknown }>(row.student_lesson_logs);
    const dailyLog = pickOne<{ class_groups: unknown }>(lessonLog?.daily_logs);

    return {
      id: row.id as string,
      scheduled_date: row.scheduled_date as string,
      start_time: (row.start_time as string | null) ?? null,
      missed_progress: (row.missed_progress as string | null) ?? null,
      student: pickOne<Pick<StudentRecord, "id" | "name">>(row.students),
      group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(dailyLog?.class_groups),
    };
  });
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

export async function scheduleMakeup(
  makeupId: string,
  input: { scheduledDate: string; startTime?: string | null; endTime?: string | null; memo?: string | null },
) {
  const { supabase, user, makeup } = await getOwnedMakeup(makeupId);

  if (makeup.status === "completed") {
    throw new Error("완료된 보충수업의 일정은 바꿀 수 없어요.");
  }

  const { error } = await supabase
    .from("makeup_lessons")
    .update({
      status: "scheduled",
      scheduled_date: input.scheduledDate,
      start_time: input.startTime || null,
      end_time: input.endTime || null,
      comment: input.memo?.trim() || makeup.comment,
    })
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
