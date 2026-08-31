import { todayDateString } from "@/lib/dates";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  AttendanceStatus,
  ClassGroupRecord,
  DailyLogRecord,
  MakeupLessonRecord,
  StudentRecord,
} from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export type TodayLogSummary = DailyLogRecord & {
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
  attendanceCounts: { present: number; late: number; absent: number; total: number };
};

export type OpenMakeupSummary = MakeupLessonRecord & {
  student: Pick<StudentRecord, "id" | "name"> | null;
};

export async function getDashboardOverview() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const today = todayDateString();

  const empty = {
    today,
    todayLogs: [] as TodayLogSummary[],
    openMakeups: [] as OpenMakeupSummary[],
  };

  if (!supabase || !user) {
    return empty;
  }

  const [logsResult, makeupsResult] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("*, class_groups(id, name), student_lesson_logs(attendance)")
      .eq("user_id", user.id)
      .eq("class_date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("makeup_lessons")
      .select("*, students(id, name)")
      .eq("user_id", user.id)
      .in("status", ["required", "scheduled"])
      .order("scheduled_date", { ascending: true }),
  ]);

  if (logsResult.error) {
    console.error("getDashboardOverview logs error", logsResult.error);
  }

  if (makeupsResult.error) {
    console.error("getDashboardOverview makeups error", makeupsResult.error);
  }

  const todayLogs = (logsResult.data ?? []).map((row) => {
    const lessonLogs = (row.student_lesson_logs ?? []) as { attendance: AttendanceStatus }[];
    const counts = { present: 0, late: 0, absent: 0, total: lessonLogs.length };

    for (const log of lessonLogs) {
      counts[log.attendance] += 1;
    }

    return {
      ...(row as unknown as DailyLogRecord),
      group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(row.class_groups),
      attendanceCounts: counts,
    };
  });

  const openMakeups = (makeupsResult.data ?? []).map((row) => ({
    ...(row as unknown as MakeupLessonRecord),
    student: pickOne<Pick<StudentRecord, "id" | "name">>(row.students),
  }));

  return { today, todayLogs, openMakeups };
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
