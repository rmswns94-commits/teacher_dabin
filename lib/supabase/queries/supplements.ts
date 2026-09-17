import { formatTimeHM } from "@/lib/schedule";
import type { SupplementOccurrence } from "@/lib/schedule-exceptions";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 보강 — 그 날 1회만 진행하는 그룹 수업.
// 저장은 기존 calendar_events(event_type='makeup')를 그대로 쓴다. 새 테이블을 만들지 않았다.
//
// "실제 수업으로 취급하는 보강"의 조건 (하나라도 빠지면 예전처럼 일정 표시로만 남는다):
//   event_type = 'makeup'  +  group_id 있음  +  start_time/end_time 있음  +  하루짜리(start=end)
// 시간이 없던 기존 보강 일정은 그대로 유효하며 수업으로 잡히지 않는다 (legacy 보존).
//
// 학생 개인 보충(makeup_lessons)과는 완전히 다른 테이블이다 — 여기서는 그쪽을 읽지도 쓰지도 않는다.

// migration 미적용(시간 컬럼 없음)은 오류가 아니라 "보강 수업 기능이 아직 꺼진 상태"다.
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

function isMissingColumn(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

type SupplementRow = {
  id: string;
  group_id: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
};

function toOccurrence(row: SupplementRow): SupplementOccurrence | null {
  if (!row.group_id || !row.start_time || !row.end_time || row.start_date !== row.end_date) {
    return null;
  }

  return {
    id: row.id,
    groupId: row.group_id,
    date: row.start_date,
    startTime: formatTimeHM(row.start_time),
    endTime: formatTimeHM(row.end_time),
  };
}

// 날짜 범위 batch (대시보드 오늘~+7일, 일지 캘린더 한 달, 특정 날짜 1일 등).
// 날짜마다/그룹마다 조회하지 않는다 (N+1 금지).
export async function getSupplementsInRange(startDate: string, endDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as SupplementOccurrence[];
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, group_id, start_date, end_date, start_time, end_time")
    .eq("user_id", user.id)
    .eq("event_type", "makeup")
    .not("group_id", "is", null)
    .gte("start_date", startDate)
    .lte("start_date", endDate);

  if (error) {
    if (!isMissingColumn(error)) {
      console.error("getSupplementsInRange error", error);
    }
    return [] as SupplementOccurrence[];
  }

  return ((data ?? []) as SupplementRow[])
    .map(toOccurrence)
    .filter((row): row is SupplementOccurrence => row !== null);
}

// 일정 id가 "실제 수업인 보강"이면 그 occurrence를, 아니면 null.
// 삭제/수정 전 안전 확인용 point lookup이다.
export async function getSupplementById(eventId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, group_id, start_date, end_date, start_time, end_time")
    .eq("user_id", user.id)
    .eq("id", eventId)
    .eq("event_type", "makeup")
    .maybeSingle();

  if (error) {
    if (!isMissingColumn(error)) {
      console.error("getSupplementById error", error);
    }
    return null;
  }

  return data ? toOccurrence(data as SupplementRow) : null;
}
