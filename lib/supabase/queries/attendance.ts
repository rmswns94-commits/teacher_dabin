import type { AttendanceEntry } from "@/lib/attendance";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { AttendanceStatus, StudentGrade } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// 월간 출결 데이터를 배치 1쿼리로 가져온다 (일자별/그룹별 반복 쿼리 금지).
// - source of truth: Daily Log의 학생 평가 attendance + class_date(수업일) — created_at 금지
// - 작성 완료(completed)된 일지만 집계한다 (draft 제외)
// - 출결 현황 페이지와 출석부 Excel이 이 함수 하나를 함께 쓴다 (항상 같은 데이터)
export async function getMonthlyAttendanceEntries(startDate: string, endDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as AttendanceEntry[];
  }

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .select(
      "student_id, attendance, students(id, name, grade), daily_logs!inner(id, class_date, group_id, status, class_groups(id, name, icon))",
    )
    .eq("user_id", user.id)
    .eq("daily_logs.status", "completed")
    .gte("daily_logs.class_date", startDate)
    .lte("daily_logs.class_date", endDate);

  if (error) {
    console.error("getMonthlyAttendanceEntries error", error);
    return [] as AttendanceEntry[];
  }

  const entries: AttendanceEntry[] = [];

  for (const row of data ?? []) {
    const dailyLog = pickOne<{
      id: string;
      class_date: string;
      group_id: string;
      class_groups: unknown;
    }>(row.daily_logs);
    const student = pickOne<{ id: string; name: string; grade: StudentGrade }>(row.students);
    const group = dailyLog
      ? pickOne<{ id: string; name: string; icon: string | null }>(dailyLog.class_groups)
      : null;

    if (!dailyLog || !student) {
      continue;
    }

    entries.push({
      classDate: dailyLog.class_date,
      groupId: dailyLog.group_id,
      groupName: group?.name ?? "수업 그룹",
      groupIcon: group?.icon ?? null,
      studentId: student.id,
      studentName: student.name,
      studentGrade: student.grade,
      attendance: row.attendance as AttendanceStatus,
    });
  }

  return entries;
}
