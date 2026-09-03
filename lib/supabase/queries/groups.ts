import { notFound } from "next/navigation";
import { cache } from "react";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupRecord, StudentGrade, StudentRecord } from "@/lib/supabase/types";

// cache(): AppShell(사이드바)과 페이지가 같은 요청 안에서 그룹 목록을
// 각각 조회해도 실제 쿼리는 인자별로 1회만 나간다.
export const getCurrentUserGroups = cache(async (includeArchived = false) => {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ClassGroupRecord[];
  }

  let query = supabase
    .from("class_groups")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getCurrentUserGroups error", error);
    return [] as ClassGroupRecord[];
  }

  return (data ?? []) as ClassGroupRecord[];
});

// 그룹별 학생 수를 쿼리 1번으로 모두 계산한다 (그룹당 count 쿼리 N+1 방지).
export async function getAllGroupStudentCounts() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const counts = new Map<string, number>();

  if (!supabase || !user) {
    return counts;
  }

  const { data, error } = await supabase
    .from("student_group_memberships")
    .select("group_id")
    .eq("user_id", user.id);

  if (error) {
    console.error("getAllGroupStudentCounts error", error);
    return counts;
  }

  for (const row of data ?? []) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return counts;
}

export async function getGroupByIdForCurrentUser(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("class_groups")
    .select("*")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getGroupByIdForCurrentUser error", error);
    return null;
  }

  return data as ClassGroupRecord | null;
}

export async function getGroupStudentCount(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return 0;
  }

  const { count, error } = await supabase
    .from("student_group_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("group_id", groupId);

  if (error) {
    console.error("getGroupStudentCount error", error);
    return 0;
  }

  return count ?? 0;
}

export async function getGroupStudentsForCurrentUser(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("student_group_memberships")
    .select("student_id, students(*)")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getGroupStudentsForCurrentUser error", error);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const students = row.students as unknown;
      const student = Array.isArray(students) ? students[0] : students;
      return student as StudentRecord | null;
    })
    .filter(Boolean) as StudentRecord[];
}

export async function getAvailableStudentsForGroup() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("students")
    .select("*")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAvailableStudentsForGroup error", error);
    return [] as StudentRecord[];
  }

  return (data ?? []) as StudentRecord[];
}

export async function createGroup(input: {
  name: string;
  grade: StudentGrade;
  memo?: string | null;
  textbook?: string | null;
  icon?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("class_groups")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      grade: input.grade,
      memo: input.memo?.trim() || null,
      textbook: input.textbook?.trim() || null,
      icon: input.icon || null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("createGroup error", error);
    throw new Error("수업 그룹을 만들지 못했어요. 다시 시도해주세요.");
  }

  return data;
}

// Creates the group and its weekly schedules together. If schedule insertion
// fails, the freshly created (still empty) group row is removed again so a
// retry never leaves a half-configured group behind.
export async function createGroupWithDetails(input: {
  name: string;
  grade: StudentGrade;
  memo?: string | null;
  textbook?: string | null;
  icon?: string | null;
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[];
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const group = await createGroup(input);

  if (input.schedules.length > 0) {
    const { error } = await supabase.from("class_group_schedules").insert(
      input.schedules.map((slot) => ({
        user_id: user.id,
        group_id: group.id,
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
      })),
    );

    if (error) {
      console.error("createGroupWithDetails schedule error", error);
      await supabase.from("class_groups").delete().eq("id", group.id).eq("user_id", user.id);
      throw new Error("수업 시간을 저장하지 못했어요. 다시 시도해주세요.");
    }
  }

  return group;
}

export async function updateGroupHighlight(groupId: string, highlightMemo: string | null) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_groups")
    .update({ highlight_memo: highlightMemo })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateGroupHighlight error", error);
    throw new Error("하이라이트를 저장하지 못했어요.");
  }

  return true;
}

export async function updateGroup(groupId: string, input: {
  name: string;
  grade: StudentGrade;
  memo?: string | null;
  textbook?: string | null;
  highlightMemo?: string | null;
  icon?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_groups")
    .update({
      name: input.name.trim(),
      grade: input.grade,
      memo: input.memo?.trim() || null,
      textbook: input.textbook?.trim() || null,
      highlight_memo: input.highlightMemo?.trim() || null,
      icon: input.icon || null,
    })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateGroup error", error);
    throw new Error("수업 그룹 정보를 저장하지 못했어요.");
  }

  return true;
}

export async function archiveGroup(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_groups")
    .update({ archived: true })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error("수업 그룹을 보관하지 못했어요.");
  }

  return true;
}

export async function restoreGroup(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_groups")
    .update({ archived: false })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error("수업 그룹을 복원하지 못했어요.");
  }

  return true;
}

export async function addStudentToGroup(groupId: string, studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase.from("student_group_memberships").insert({
    user_id: user.id,
    student_id: studentId,
    group_id: groupId,
  });

  if (error) {
    if (error.message.includes("duplicate key") || error.message.includes("already exists")) {
      throw new Error("이미 그룹에 포함된 학생입니다.");
    }

    throw new Error("학생을 그룹에 추가하지 못했어요.");
  }

  return true;
}

export async function removeStudentFromGroup(groupId: string, studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_group_memberships")
    .delete()
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("student_id", studentId);

  if (error) {
    throw new Error("학생을 그룹에서 제외하지 못했어요.");
  }

  return true;
}

export type GroupRecentLog = {
  id: string;
  class_date: string;
  title: string | null;
  lesson_content: string | null;
  default_progress: string | null;
  status: "draft" | "completed";
};

export async function getGroupRecentLogs(groupId: string, limit = 5) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as GroupRecentLog[];
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, class_date, title, lesson_content, default_progress, status")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .order("class_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getGroupRecentLogs error", error);
    return [] as GroupRecentLog[];
  }

  return (data ?? []) as GroupRecentLog[];
}

export async function getGroupLatestProgress(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, class_date, default_progress, title, homework, next_lesson_plan")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("status", "completed")
    .order("class_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getGroupLatestProgress error", error);
    return null;
  }

  return data as {
    id: string;
    class_date: string;
    default_progress: string | null;
    title: string | null;
    homework: string | null;
    next_lesson_plan: string | null;
  } | null;
}

export async function updateGroupPreparationItems(
  groupId: string,
  items: { id: string; text: string; completed: boolean }[],
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_groups")
    .update({ preparation_items: items })
    .eq("id", groupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateGroupPreparationItems error", error);
    throw new Error("수업 준비 내용을 저장하지 못했어요.");
  }

  return true;
}

export type GroupLatestLogSummary = {
  id: string;
  class_date: string;
  status: "draft" | "completed";
  default_progress: string | null;
  title: string | null;
};

function pickLatestLog(value: unknown): GroupLatestLogSummary | null {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return (rows[0] ?? null) as GroupLatestLogSummary | null;
}

// 그룹별 "가장 최근 수업일지 1건"을 쿼리 1번으로 가져온다.
// PostgREST embedded limit은 부모 행마다 적용되므로 그룹당 쿼리(N+1)가 없다.
export async function getLatestLogPerGroup(onlyCompleted = false) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const result = new Map<string, GroupLatestLogSummary>();

  if (!supabase || !user) {
    return result;
  }

  let query = supabase
    .from("class_groups")
    .select("id, daily_logs(id, class_date, status, default_progress, title)")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("class_date", { referencedTable: "daily_logs", ascending: false })
    .order("created_at", { referencedTable: "daily_logs", ascending: false })
    .limit(1, { referencedTable: "daily_logs" });

  if (onlyCompleted) {
    query = query.eq("daily_logs.status", "completed");
  }

  const { data, error } = await query;

  if (error) {
    console.error("getLatestLogPerGroup error", error);
    return result;
  }

  for (const row of data ?? []) {
    const log = pickLatestLog(row.daily_logs);

    if (log) {
      result.set(row.id as string, log);
    }
  }

  return result;
}

export type AttendanceSummary = { present: number; late: number; absent: number };

// 주어진 일지들의 출결 집계를 쿼리 1번으로 계산한다 (일지당 쿼리 금지).
export async function getAttendanceSummaryForLogs(logIds: string[]) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const result = new Map<string, AttendanceSummary>();

  if (!supabase || !user || logIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .select("daily_log_id, attendance")
    .eq("user_id", user.id)
    .in("daily_log_id", logIds);

  if (error) {
    console.error("getAttendanceSummaryForLogs error", error);
    return result;
  }

  for (const row of data ?? []) {
    const summary = result.get(row.daily_log_id) ?? { present: 0, late: 0, absent: 0 };

    if (row.attendance === "present") summary.present += 1;
    else if (row.attendance === "late") summary.late += 1;
    else if (row.attendance === "absent") summary.absent += 1;

    result.set(row.daily_log_id, summary);
  }

  return result;
}

export type GroupExamSummary = {
  group_id: string;
  title: string;
  start_date: string;
  end_date: string;
};

// 오늘~toDate와 겹치는, 그룹에 연결된 시험 일정만 조회한다.
// (group_id 없는 전체 일정은 특정 반의 시험으로 보지 않는다 — 전체 history 조회 금지)
export async function getUpcomingGroupExams(fromDate: string, toDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as GroupExamSummary[];
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("group_id, title, start_date, end_date")
    .eq("user_id", user.id)
    .eq("event_type", "exam")
    .not("group_id", "is", null)
    .lte("start_date", toDate)
    .gte("end_date", fromDate)
    .order("start_date", { ascending: true });

  if (error) {
    console.error("getUpcomingGroupExams error", error);
    return [] as GroupExamSummary[];
  }

  return (data ?? []) as GroupExamSummary[];
}

// 그룹 대시보드 "최근 체크"용: 특정 일지의 학생 기록을 쿼리 1번으로 집계.
export async function getLessonQuickCheckCounts(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const counts = { homeworkMissing: 0, retest: 0, parentPending: 0 };

  if (!supabase || !user) {
    return counts;
  }

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .select("homework_status, vocab_retest, parent_note_status")
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId);

  if (error) {
    console.error("getLessonQuickCheckCounts error", error);
    return counts;
  }

  for (const row of data ?? []) {
    if (row.homework_status === "missing") counts.homeworkMissing += 1;
    if (row.vocab_retest) counts.retest += 1;
    if (row.parent_note_status === "pending") counts.parentPending += 1;
  }

  return counts;
}

export async function getGroupOrThrow(groupId: string) {
  const group = await getGroupByIdForCurrentUser(groupId);

  if (!group) {
    notFound();
  }

  return group;
}
