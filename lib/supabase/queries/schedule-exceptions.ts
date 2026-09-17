import { formatTimeHM } from "@/lib/schedule";
import type { ScheduleExceptionEntry, ScheduleExceptionKind } from "@/lib/schedule-exceptions";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 정규수업 1회 예외(휴강/시간 변경) 조회·저장.
// 조회는 전부 날짜 range batch다 — 화면에서 schedule/날짜마다 쿼리를 돌리지 않는다(N+1 금지).
// 실패 시 빈 목록을 돌려줘 예외를 "없는 것"으로 보고 기존 시간표대로 동작한다(화면은 항상 뜬다).

type ExceptionRow = {
  id: string;
  group_id: string;
  schedule_id: string;
  occurrence_date: string;
  kind: ScheduleExceptionKind;
  start_time: string | null;
  end_time: string | null;
};

function toEntry(row: ExceptionRow): ScheduleExceptionEntry {
  return {
    id: row.id,
    groupId: row.group_id,
    scheduleId: row.schedule_id,
    date: row.occurrence_date,
    kind: row.kind,
    startTime: row.start_time ? formatTimeHM(row.start_time) : null,
    endTime: row.end_time ? formatTimeHM(row.end_time) : null,
  };
}

const SELECT_COLUMNS = "id, group_id, schedule_id, occurrence_date, kind, start_time, end_time";

// migration 미적용(테이블 없음)은 오류가 아니라 "예외 기능이 아직 꺼진 상태"다 —
// 읽기 경로에서는 조용히 빈 목록으로 두고, 저장 경로에서만 사용자에게 알린다.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

// 날짜 범위 batch (대시보드 오늘~+7일, 일지 화면의 특정 날짜 등)
export async function getScheduleExceptionsInRange(startDate: string, endDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ScheduleExceptionEntry[];
  }

  const { data, error } = await supabase
    .from("class_schedule_exceptions")
    .select(SELECT_COLUMNS)
    .eq("user_id", user.id)
    .gte("occurrence_date", startDate)
    .lte("occurrence_date", endDate);

  if (error) {
    // 테이블 미적용(migration 전)은 조용히 빈 목록 — 예외 없음 = 기존 시간표대로 동작
    if (!isMissingTable(error)) {
      console.error("getScheduleExceptionsInRange error", error);
    }
    return [] as ScheduleExceptionEntry[];
  }

  return ((data ?? []) as ExceptionRow[]).map(toEntry);
}

// 그룹의 특정 날짜 이후 예외 (그룹 상세의 "예정된 1회 변경")
export async function getGroupScheduleExceptionsFrom(groupId: string, fromDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ScheduleExceptionEntry[];
  }

  const { data, error } = await supabase
    .from("class_schedule_exceptions")
    .select(SELECT_COLUMNS)
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .gte("occurrence_date", fromDate)
    .order("occurrence_date", { ascending: true });

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getGroupScheduleExceptionsFrom error", error);
    }
    return [] as ScheduleExceptionEntry[];
  }

  return ((data ?? []) as ExceptionRow[]).map(toEntry);
}

// 1회 예외 저장 — 같은 occurrence에는 항상 하나만 존재한다(unique + upsert).
// 휴강 ↔ 시간 변경 전환도 새 row가 아니라 같은 row 갱신이다.
export async function upsertScheduleException(input: {
  groupId: string;
  scheduleId: string;
  date: string;
  kind: ScheduleExceptionKind;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  // 대상 시간표 row가 내 것인지 확인 (RLS와 별개로 서버에서도 명시 검증)
  const { data: schedule } = await supabase
    .from("class_group_schedules")
    .select("id")
    .eq("id", input.scheduleId)
    .eq("group_id", input.groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!schedule) {
    throw new Error("수업 시간을 찾을 수 없어요.");
  }

  const { error } = await supabase.from("class_schedule_exceptions").upsert(
    {
      user_id: user.id,
      group_id: input.groupId,
      schedule_id: input.scheduleId,
      occurrence_date: input.date,
      kind: input.kind,
      start_time: input.kind === "time_override" ? input.startTime ?? null : null,
      end_time: input.kind === "time_override" ? input.endTime ?? null : null,
    },
    { onConflict: "schedule_id,occurrence_date" },
  );

  if (error) {
    console.error("upsertScheduleException error", error);
    // 저장 경로에서는 미적용 원인을 숨기지 않는다 ("다시 시도"로 풀리지 않는 문제)
    throw new Error(
      isMissingTable(error)
        ? "1회 변경에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260918_create_class_schedule_exceptions.sql을 실행한 뒤 다시 시도해주세요."
        : "수업 일정을 변경하지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }

  return true;
}

// "원래대로" — 예외 row만 삭제한다 (반복 시간표는 그대로).
export async function deleteScheduleException(exceptionId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_schedule_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteScheduleException error", error);
    throw new Error("수업 일정을 되돌리지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return true;
}

// 해당 occurrence에 이미 일지가 있는지 (휴강/시간 변경 안전 차단용).
// 일지는 group+date identity라 그 날짜 일지 하나만 확인하면 된다.
export async function getDailyLogStatusForOccurrence(groupId: string, date: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("class_date", date)
    .maybeSingle();

  if (error) {
    console.error("getDailyLogStatusForOccurrence error", error);
    return null;
  }

  return (data as { id: string; status: "draft" | "completed" } | null) ?? null;
}
