import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  ClassGroupRecord,
  DailyLogRecord,
  MakeupLessonRecord,
  StudentLessonLogRecord,
} from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export type StudentLessonHistoryItem = StudentLessonLogRecord & {
  dailyLog:
    | (Pick<DailyLogRecord, "id" | "class_date" | "title" | "default_progress"> & {
        group: Pick<ClassGroupRecord, "id" | "name"> | null;
      })
    | null;
};

export async function getStudentLessonHistory(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as StudentLessonHistoryItem[];
  }

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .select("*, daily_logs(id, class_date, title, default_progress, class_groups(id, name))")
    .eq("user_id", user.id)
    .eq("student_id", studentId);

  if (error) {
    console.error("getStudentLessonHistory error", error);
    return [] as StudentLessonHistoryItem[];
  }

  return (data ?? [])
    .map((row) => {
      const dailyLogRaw = pickOne<Record<string, unknown>>(row.daily_logs);

      return {
        ...(row as unknown as StudentLessonLogRecord),
        dailyLog: dailyLogRaw
          ? {
              ...(dailyLogRaw as unknown as Pick<
                DailyLogRecord,
                "id" | "class_date" | "title" | "default_progress"
              >),
              group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(dailyLogRaw.class_groups),
            }
          : null,
      };
    })
    .sort((a, b) => (b.dailyLog?.class_date ?? "").localeCompare(a.dailyLog?.class_date ?? ""));
}

export function summarizeAttendance(history: StudentLessonHistoryItem[]) {
  const summary = { present: 0, late: 0, absent: 0, total: history.length };

  for (const item of history) {
    summary[item.attendance] += 1;
  }

  return summary;
}

export async function getStudentMakeups(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as MakeupLessonRecord[];
  }

  const { data, error } = await supabase
    .from("makeup_lessons")
    .select("*")
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getStudentMakeups error", error);
    return [] as MakeupLessonRecord[];
  }

  return (data ?? []) as MakeupLessonRecord[];
}
