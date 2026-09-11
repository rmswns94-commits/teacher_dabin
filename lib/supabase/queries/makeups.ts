import { cache } from "react";

import { formatTimeHM } from "@/lib/schedule";
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

// migration 미적용(컬럼/relationship 없음) 시 legacy 모양으로 재시도하기 위한 코드들
const SCHEMA_MISMATCH_CODES = new Set(["42703", "PGRST200", "PGRST204"]);

const MANUAL_MIGRATION_MESSAGE =
  "보충 직접 등록에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260908_add_manual_makeups.sql을 실행한 뒤 다시 시도해주세요.";

// 보충 목록 + 학생 + 그룹 relation embed 쿼리 1번 (N+1 금지).
// 그룹은 직접 등록 보충의 group_id를 우선하고, 결석 연동 legacy는 일지 경유로 파생한다.
export async function getCurrentUserMakeups() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as MakeupWithStudent[];
  }

  let { data, error } = await supabase
    .from("makeup_lessons")
    .select(
      "*, students(id, name, grade), direct_group:class_groups!makeup_lessons_group_id_fkey(id, name), student_lesson_logs(daily_log_id, daily_logs(id, class_groups(id, name)))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error && SCHEMA_MISMATCH_CODES.has(error.code ?? "")) {
    // migration 적용 전에도 기존 보충 화면은 그대로 떠야 한다 — legacy select로 재시도
    ({ data, error } = await supabase
      .from("makeup_lessons")
      .select(
        "*, students(id, name, grade), student_lesson_logs(daily_log_id, daily_logs(id, class_groups(id, name)))",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }));
  }

  if (error) {
    console.error("getCurrentUserMakeups error", error);
    return [] as MakeupWithStudent[];
  }

  return (data ?? []).map((row) => {
    const lessonLog = pickOne<{ daily_log_id: string | null; daily_logs: unknown }>(
      row.student_lesson_logs,
    );
    const dailyLog = pickOne<{ id: string; class_groups: unknown }>(lessonLog?.daily_logs);
    const record = row as unknown as MakeupLessonRecord & { direct_group?: unknown };

    return {
      ...record,
      source: record.source ?? "absence",
      student: pickOne<Pick<StudentRecord, "id" | "name" | "grade">>(row.students),
      group:
        pickOne<Pick<ClassGroupRecord, "id" | "name">>(record.direct_group) ??
        pickOne<Pick<ClassGroupRecord, "id" | "name">>(dailyLog?.class_groups),
      dailyLogId: dailyLog?.id ?? null,
    };
  });
}

export type CompletedMakeupForExport = {
  id: string;
  source: string;
  completed_date: string | null;
  original_class_date: string;
  missed_progress: string | null;
  completed_progress: string | null;
  start_time: string | null;
  end_time: string | null;
  studentName: string | null;
  // 결석 연동 보충의 원래 수업 그룹 (직접 등록은 group_id 우선 — getCurrentUserMakeups와 동일 규칙)
  groupId: string | null;
};

// 보충 수업 Excel 내보내기용 — completed만 (required/scheduled/cancelled 제외).
// 학생/그룹 relation embed 쿼리 1번 (Excel row 수와 무관 — N+1 금지). read-only.
export async function getCompletedMakeupsForExport() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as CompletedMakeupForExport[];
  }

  const primary = await supabase
    .from("makeup_lessons")
    .select(
      "id, source, completed_date, original_class_date, missed_progress, completed_progress, start_time, end_time, students(name), direct_group:class_groups!makeup_lessons_group_id_fkey(id), student_lesson_logs(daily_logs(group_id))",
    )
    .eq("user_id", user.id)
    .eq("status", "completed");

  let data: Record<string, unknown>[] | null = primary.data;
  let error = primary.error;

  if (error && SCHEMA_MISMATCH_CODES.has(error.code ?? "")) {
    // 직접 등록 migration 적용 전 legacy 모양 재시도 (결석 연동 보충만 존재하는 계정)
    const fallback = await supabase
      .from("makeup_lessons")
      .select(
        "id, completed_date, original_class_date, missed_progress, completed_progress, start_time, end_time, students(name), student_lesson_logs(daily_logs(group_id))",
      )
      .eq("user_id", user.id)
      .eq("status", "completed");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("getCompletedMakeupsForExport error", error);
    throw new Error("완료된 보충 수업을 불러오지 못했어요.");
  }

  return (data ?? []).map((row) => {
    const record = row as unknown as {
      id: string;
      source?: string | null;
      completed_date: string | null;
      original_class_date: string;
      missed_progress: string | null;
      completed_progress: string | null;
      start_time: string | null;
      end_time: string | null;
      students: unknown;
      direct_group?: unknown;
      student_lesson_logs: unknown;
    };
    const lessonLog = pickOne<{ daily_logs: unknown }>(record.student_lesson_logs);
    const dailyLog = pickOne<{ group_id: string | null }>(lessonLog?.daily_logs);

    return {
      id: record.id,
      source: record.source ?? "absence",
      completed_date: record.completed_date,
      original_class_date: record.original_class_date,
      missed_progress: record.missed_progress,
      completed_progress: record.completed_progress,
      start_time: record.start_time,
      end_time: record.end_time,
      studentName: pickOne<{ name: string }>(record.students)?.name ?? null,
      groupId: pickOne<{ id: string }>(record.direct_group)?.id ?? dailyLog?.group_id ?? null,
    };
  });
}

// ── 직접 등록 보충 ──────────────────────────────────────────────────────
// 결석 연동 없이 Teacher가 학생/그룹/날짜/시간을 지정한다. 날짜가 이미 있으므로
// pending(required)을 거치지 않고 바로 scheduled로 생성한다.
// original_class_date는 NOT NULL 제약 유지를 위해 보충 날짜로 채운다(표시는 source 기준 —
// manual row에서 이 값은 어디에도 "결석"으로 보여주지 않는다).
export async function createManualMakeup(input: {
  studentId: string;
  groupId: string | null;
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  memo: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", input.studentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없어요.");
  }

  if (input.groupId) {
    const { data: group } = await supabase
      .from("class_groups")
      .select("id")
      .eq("id", input.groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!group) {
      throw new Error("수업 그룹을 찾을 수 없어요.");
    }
  }

  const { error } = await supabase.from("makeup_lessons").insert({
    user_id: user.id,
    student_id: input.studentId,
    student_lesson_log_id: null,
    group_id: input.groupId,
    source: "manual",
    original_class_date: input.scheduledDate,
    status: "scheduled",
    scheduled_date: input.scheduledDate,
    start_time: input.startTime,
    end_time: input.endTime,
    comment: input.memo?.trim() || null,
  });

  if (error) {
    console.error("createManualMakeup error", error);
    throw new Error(
      SCHEMA_MISMATCH_CODES.has(error.code ?? "")
        ? MANUAL_MIGRATION_MESSAGE
        : "보충 수업을 등록하지 못했어요. 다시 시도해주세요.",
    );
  }

  return true;
}

// 직접 등록 보충 수정 (학생/그룹/날짜/시간/메모).
// 완료된 기록은 history 보호를 위해 이 경로로 수정하지 않는다.
export async function updateManualMakeup(
  makeupId: string,
  input: {
    studentId: string;
    groupId: string | null;
    scheduledDate: string;
    startTime: string | null;
    endTime: string | null;
    memo: string | null;
  },
) {
  const { supabase, user, makeup } = await getOwnedMakeup(makeupId);

  if (makeup.source !== "manual") {
    throw new Error("결석 연동 보충은 [일정 변경]에서 수정해주세요.");
  }

  if (makeup.status === "completed") {
    throw new Error("완료된 보충 기록은 수정할 수 없어요.");
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", input.studentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없어요.");
  }

  if (input.groupId) {
    const { data: group } = await supabase
      .from("class_groups")
      .select("id")
      .eq("id", input.groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!group) {
      throw new Error("수업 그룹을 찾을 수 없어요.");
    }
  }

  const { error } = await supabase
    .from("makeup_lessons")
    .update({
      student_id: input.studentId,
      group_id: input.groupId,
      original_class_date: input.scheduledDate,
      scheduled_date: input.scheduledDate,
      status: "scheduled",
      start_time: input.startTime,
      end_time: input.endTime,
      comment: input.memo?.trim() || null,
    })
    .eq("id", makeupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateManualMakeup error", error);
    throw new Error("보충 수업을 수정하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// 직접 등록 보충 삭제 (결석 연동 보충은 기존 취소(cancelled) 흐름 유지 — 이 경로 사용 불가)
export async function deleteManualMakeup(makeupId: string) {
  const { supabase, user, makeup } = await getOwnedMakeup(makeupId);

  if (makeup.source !== "manual") {
    throw new Error("결석 연동 보충은 삭제 대신 [취소]로 기록을 남겨주세요.");
  }

  const { error } = await supabase
    .from("makeup_lessons")
    .delete()
    .eq("id", makeupId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteManualMakeup error", error);
    throw new Error("보충 수업을 삭제하지 못했어요. 다시 시도해주세요.");
  }

  return true;
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

  const primary = await supabase
    .from("makeup_lessons")
    .select(
      "id, scheduled_date, start_time, missed_progress, students(id, name), direct_group:class_groups!makeup_lessons_group_id_fkey(id, name), student_lesson_logs(daily_logs(class_groups(id, name)))",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .gte("scheduled_date", monthStart)
    .lte("scheduled_date", monthEnd)
    .order("scheduled_date", { ascending: true });

  let data: Record<string, unknown>[] | null = primary.data;
  let error = primary.error;

  if (error && SCHEMA_MISMATCH_CODES.has(error.code ?? "")) {
    // migration 적용 전 fallback (legacy select)
    const fallback = await supabase
      .from("makeup_lessons")
      .select(
        "id, scheduled_date, start_time, missed_progress, students(id, name), student_lesson_logs(daily_logs(class_groups(id, name)))",
      )
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd)
      .order("scheduled_date", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("getMonthlyScheduledMakeups error", error);
    return [] as MonthlyMakeupMarker[];
  }

  return (data ?? []).map((row) => {
    const lessonLog = pickOne<{ daily_logs: unknown }>(row.student_lesson_logs);
    const dailyLog = pickOne<{ class_groups: unknown }>(lessonLog?.daily_logs);
    const directGroup = pickOne<Pick<ClassGroupRecord, "id" | "name">>(
      (row as { direct_group?: unknown }).direct_group,
    );

    return {
      id: row.id as string,
      scheduled_date: row.scheduled_date as string,
      start_time: (row.start_time as string | null) ?? null,
      missed_progress: (row.missed_progress as string | null) ?? null,
      student: pickOne<Pick<StudentRecord, "id" | "name">>(row.students),
      group: directGroup ?? pickOne<Pick<ClassGroupRecord, "id" | "name">>(dailyLog?.class_groups),
    };
  });
}

// Dashboard "오늘 보충 수업" 카드용 — 오늘 실제로 해야 하는 보충만.
// status=scheduled(=일정이 잡힌 미완료) + scheduled_date=오늘. 일정이 필요한 보충(required)·
// 완료·취소는 애초에 조회하지 않는다. 학생/원래 반은 relation embed라 건수와 무관하게 1쿼리.
export type TodayScheduledMakeup = {
  id: string;
  studentName: string;
  groupName: string | null;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  scheduledDate: string;
  missedProgress: string | null;
  comment: string | null;
};

export async function getTodayScheduledMakeups(today: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as TodayScheduledMakeup[];
  }

  const columns =
    "id, scheduled_date, start_time, end_time, missed_progress, comment, students(id, name)";
  const primary = await supabase
    .from("makeup_lessons")
    .select(
      `${columns}, direct_group:class_groups!makeup_lessons_group_id_fkey(id, name), student_lesson_logs(daily_logs(class_groups(id, name)))`,
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .eq("scheduled_date", today)
    .order("start_time", { ascending: true, nullsFirst: false });

  let data: Record<string, unknown>[] | null = primary.data;
  let error = primary.error;

  if (error && SCHEMA_MISMATCH_CODES.has(error.code ?? "")) {
    // migration 적용 전 fallback (직접 등록 group relation 없음)
    const fallback = await supabase
      .from("makeup_lessons")
      .select(`${columns}, student_lesson_logs(daily_logs(class_groups(id, name)))`)
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .eq("scheduled_date", today)
      .order("start_time", { ascending: true, nullsFirst: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("getTodayScheduledMakeups error", error);
    return [] as TodayScheduledMakeup[];
  }

  return (data ?? []).map((row) => {
    const lessonLog = pickOne<{ daily_logs: unknown }>(row.student_lesson_logs);
    const dailyLog = pickOne<{ class_groups: unknown }>(lessonLog?.daily_logs);
    const directGroup = pickOne<Pick<ClassGroupRecord, "id" | "name">>(
      (row as { direct_group?: unknown }).direct_group,
    );
    const group = directGroup ?? pickOne<Pick<ClassGroupRecord, "id" | "name">>(dailyLog?.class_groups);
    const student = pickOne<Pick<StudentRecord, "id" | "name">>(row.students);

    return {
      id: row.id as string,
      studentName: student?.name ?? "학생",
      groupName: group?.name ?? null,
      startTime: row.start_time ? formatTimeHM(row.start_time as string) : null,
      endTime: row.end_time ? formatTimeHM(row.end_time as string) : null,
      scheduledDate: row.scheduled_date as string,
      missedProgress: (row.missed_progress as string | null) ?? null,
      comment: (row.comment as string | null) ?? null,
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
