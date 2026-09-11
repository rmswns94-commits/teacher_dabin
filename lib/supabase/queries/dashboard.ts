import { todayDateString } from "@/lib/dates";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { AttendanceStatus, ClassGroupRecord, DailyLogRecord } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// 대시보드 Today class 카드가 실제로 쓰는 필드만. daily_logs에는 진도/계획/회고 같은
// 긴 text와 jsonb가 여러 개라 select("*")로 받으면 화면에 안 쓰는 데이터를 매번 실어 온다.
export type TodayLogSummary = Pick<DailyLogRecord, "id" | "status" | "group_id" | "class_date"> & {
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
  attendanceCounts: {
    present: number;
    late: number;
    early_leave: number;
    absent: number;
    total: number;
  };
};

export async function getDashboardOverview() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const today = todayDateString();

  const empty = {
    today,
    todayLogs: [] as TodayLogSummary[],
  };

  if (!supabase || !user) {
    return empty;
  }

  // 보충은 대시보드의 "오늘 보충 수업" 카드가 getTodayScheduledMakeups로 따로 읽는다.
  // 예전에 여기서도 열린 보충을 전부 받아왔지만 화면에서 쓰이지 않아 제거했다 (왕복 1회 절약).
  const logsResult = await supabase
    .from("daily_logs")
    .select("id, status, group_id, class_date, class_groups(id, name), student_lesson_logs(attendance)")
    .eq("user_id", user.id)
    .eq("class_date", today)
    .order("created_at", { ascending: false });

  if (logsResult.error) {
    console.error("getDashboardOverview logs error", logsResult.error);
  }

  const todayLogs = (logsResult.data ?? []).map((row) => {
    const lessonLogs = (row.student_lesson_logs ?? []) as { attendance: AttendanceStatus }[];
    const counts = { present: 0, late: 0, early_leave: 0, absent: 0, total: lessonLogs.length };

    for (const log of lessonLogs) {
      counts[log.attendance] += 1;
    }

    return {
      id: row.id as string,
      status: row.status as DailyLogRecord["status"],
      group_id: row.group_id as string,
      class_date: row.class_date as string,
      group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(row.class_groups),
      attendanceCounts: counts,
    };
  });

  return { today, todayLogs };
}

export async function getDashboardStats() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { students: 0, groups: 0 };
  }

  const [{ count: studentsCount }, { count: groupsCount }] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("archived", false),
    supabase
      .from("class_groups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("archived", false),
  ]);

  return {
    students: studentsCount ?? 0,
    groups: groupsCount ?? 0,
  };
}
