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

// 학생 목록용: 최근 N일의 모든 학생 수업 기록을 한 번에 가져온다 (N+1 방지).
export type RecentLessonRecord = {
  student_id: string;
  attendance: "present" | "late" | "absent";
  progress: string | null;
  memo: string | null;
  strengths: string | null;
  improvements: string | null;
  class_date: string;
};

export async function getRecentLessonRecords(sinceDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as RecentLessonRecord[];
  }

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .select("student_id, attendance, progress, memo, strengths, improvements, daily_logs!inner(class_date)")
    .eq("user_id", user.id)
    .gte("daily_logs.class_date", sinceDate);

  if (error) {
    console.error("getRecentLessonRecords error", error);
    return [] as RecentLessonRecord[];
  }

  return (data ?? []).map((row) => {
    const dailyLog = pickOne<{ class_date: string }>(row.daily_logs);
    return {
      student_id: row.student_id,
      attendance: row.attendance,
      progress: row.progress,
      memo: row.memo,
      strengths: row.strengths,
      improvements: row.improvements,
      class_date: dailyLog?.class_date ?? "",
    } as RecentLessonRecord;
  });
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
