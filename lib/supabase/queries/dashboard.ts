import {
  completenessFromPersistedLog,
  type DailyLogCompletenessSource,
  type LessonRowForCompleteness,
  type PersistedLogForCompleteness,
} from "@/lib/daily-log-completeness";
import { todayDateString } from "@/lib/dates";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupRecord, DailyLogRecord } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// 대시보드가 실제로 쓰는 필드만 — Today class 카드(상태/출결 수) + 수업 마무리 체크리스트(완성도).
// 완성도 판정에 필요한 진도/계획/회고 text·jsonb는 오늘 일지(≤ 오늘 수업 수)에 한해 읽되,
// 서버에서 boolean/count로 줄여 내려보낸다 (긴 본문을 화면으로 실어 나르지 않는다).
export type TodayLogSummary = Pick<DailyLogRecord, "id" | "status" | "group_id" | "class_date"> & {
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
  attendanceCounts: {
    present: number;
    late: number;
    early_leave: number;
    absent: number;
    total: number;
  };
  // 수업 마무리 체크리스트 source — lib/daily-log-completeness가 저장된 row에서 파생 (새 DB field 없음)
  completeness: DailyLogCompletenessSource;
};

const TODAY_LOG_SELECT =
  "id, status, group_id, class_date, default_progress, lesson_content, textbook_progress, school_progress, homework, next_lesson_plan, textbook_plans, school_plans, tasks, task_content, reflection_good, reflection_hard, reflection_next, class_groups(id, name), student_lesson_logs(attendance, homework_status, online_review_completed, strengths, improvements, memo, focus_level, participation_level, question_level, kindness_level, effort_level)";

export async function getDashboardOverview() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const today = todayDateString();

  const empty = {
    today,
    todayLogs: [] as TodayLogSummary[],
    // 조회 실패 표시 — 미작성 수업일지 알림이 "전부 미작성" false alarm을 만들지 않게
    todayLogsFailed: false,
  };

  if (!supabase || !user) {
    return empty;
  }

  // 보충은 대시보드의 "오늘 보충 수업" 카드가 getTodayScheduledMakeups로 따로 읽는다.
  // 예전에 여기서도 열린 보충을 전부 받아왔지만 화면에서 쓰이지 않아 제거했다 (왕복 1회 절약).
  const logsResult = await supabase
    .from("daily_logs")
    .select(TODAY_LOG_SELECT)
    .eq("user_id", user.id)
    .eq("class_date", today)
    .order("created_at", { ascending: false });

  if (logsResult.error) {
    console.error("getDashboardOverview logs error", logsResult.error);
  }

  const todayLogs = (logsResult.data ?? []).map((row) => {
    const lessonLogs = (row.student_lesson_logs ?? []) as LessonRowForCompleteness[];
    const counts = { present: 0, late: 0, early_leave: 0, absent: 0, total: lessonLogs.length };

    for (const log of lessonLogs) {
      counts[log.attendance] += 1;
    }

    const persisted = row as unknown as PersistedLogForCompleteness;

    return {
      id: row.id as string,
      status: row.status as DailyLogRecord["status"],
      group_id: row.group_id as string,
      class_date: row.class_date as string,
      group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(row.class_groups),
      attendanceCounts: counts,
      completeness: completenessFromPersistedLog({ ...persisted, student_lesson_logs: lessonLogs }),
    };
  });

  return { today, todayLogs, todayLogsFailed: Boolean(logsResult.error) };
}

// 그룹 수는 여기서 세지 않는다 — Dashboard가 어차피 getCurrentUserGroups()로 전체 목록을
// 갖고 있어(환영 카드 조건은 allGroups.length 사용) count 쿼리가 요청마다 1개 중복이었다.
export async function getDashboardStats() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { students: 0 };
  }

  const { count: studentsCount } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("archived", false);

  return {
    students: studentsCount ?? 0,
  };
}
