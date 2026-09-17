import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { CalendarEventRecord, ClassGroupRecord } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export type CalendarEventWithGroup = CalendarEventRecord & {
  group: Pick<ClassGroupRecord, "id" | "name"> | null;
};

// 현재 월과 "겹치는" 일정만 조회한다 (기간 일정 포함).
// 그룹 filter가 있어도 전체 일정(group_id null)은 항상 함께 보여준다.
export async function getMonthlyEvents(
  monthStart: string,
  monthEnd: string,
  filters?: { groupId?: string },
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as CalendarEventWithGroup[];
  }

  let query = supabase
    .from("calendar_events")
    .select("*, class_groups(id, name)")
    .eq("user_id", user.id)
    .lte("start_date", monthEnd)
    .gte("end_date", monthStart)
    .order("start_date", { ascending: true });

  if (filters?.groupId) {
    query = query.or(`group_id.is.null,group_id.eq.${filters.groupId}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getMonthlyEvents error", error);
    return [] as CalendarEventWithGroup[];
  }

  return (data ?? []).map((row) => ({
    ...(row as unknown as CalendarEventRecord),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(row.class_groups),
  }));
}

// 대시보드 "다가오는 시험" 카드용: 제목에 "시험"이 들어가거나 시험 유형인 일정을
// 호출부가 지정한 D-day 윈도우(진행 중 포함)로 조회한다 (1쿼리 batch — 현재 D-30).
export async function getUpcomingExamEvents(fromDate: string, toDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as CalendarEventWithGroup[];
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, class_groups(id, name)")
    .eq("user_id", user.id)
    .or("event_type.eq.exam,title.ilike.%시험%")
    .lte("start_date", toDate)
    .gte("end_date", fromDate)
    .order("start_date", { ascending: true });

  if (error) {
    console.error("getUpcomingExamEvents error", error);
    return [] as CalendarEventWithGroup[];
  }

  return (data ?? []).map((row) => ({
    ...(row as unknown as CalendarEventRecord),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name">>(row.class_groups),
  }));
}

async function requireContext() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  return { supabase, user };
}

// 보강 시간 컬럼(migration) 미적용 여부 — 저장 경로에서만 사용자에게 알린다.
function isMissingTimeColumn(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function assertGroupOwnership(groupId: string | null) {
  if (!groupId) {
    return;
  }

  const { supabase, user } = await requireContext();
  const { data } = await supabase
    .from("class_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    throw new Error("수업 그룹을 찾을 수 없어요.");
  }
}

export type CalendarEventInput = {
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  groupId: string | null;
  memo: string | null;
  // 보강(그날 1회 진행하는 그룹 수업)일 때만 값이 있다. 일반 일정은 null.
  startTime?: string | null;
  endTime?: string | null;
};

export async function createCalendarEvent(input: CalendarEventInput) {
  const { supabase, user } = await requireContext();
  await assertGroupOwnership(input.groupId);

  const { error } = await supabase.from("calendar_events").insert({
    user_id: user.id,
    title: input.title.trim(),
    event_type: input.eventType,
    start_date: input.startDate,
    end_date: input.endDate,
    group_id: input.groupId,
    memo: input.memo?.trim() || null,
    start_time: input.startTime ?? null,
    end_time: input.endTime ?? null,
  });

  if (error) {
    console.error("createCalendarEvent error", error);
    throw new Error(
      isMissingTimeColumn(error)
        ? "보강 수업에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260921_add_supplement_class_times.sql을 실행한 뒤 다시 시도해주세요."
        : "일정을 저장하지 못했어요. 다시 시도해주세요.",
    );
  }

  return true;
}

export async function updateCalendarEvent(eventId: string, input: CalendarEventInput) {
  const { supabase, user } = await requireContext();
  await assertGroupOwnership(input.groupId);

  const { error } = await supabase
    .from("calendar_events")
    .update({
      title: input.title.trim(),
      event_type: input.eventType,
      start_date: input.startDate,
      end_date: input.endDate,
      group_id: input.groupId,
      memo: input.memo?.trim() || null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
    })
    .eq("id", eventId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateCalendarEvent error", error);
    throw new Error(
      isMissingTimeColumn(error)
        ? "보강 수업에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260921_add_supplement_class_times.sql을 실행한 뒤 다시 시도해주세요."
        : "일정을 수정하지 못했어요.",
    );
  }

  return true;
}

export async function deleteCalendarEvent(eventId: string) {
  const { supabase, user } = await requireContext();

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteCalendarEvent error", error);
    throw new Error("일정을 삭제하지 못했어요.");
  }

  return true;
}
