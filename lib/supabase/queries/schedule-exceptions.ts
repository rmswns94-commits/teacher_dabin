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
  moved_to_date: string | null;
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
    movedToDate: row.moved_to_date ?? null,
  };
}

const LEGACY_SELECT_COLUMNS = "id, group_id, schedule_id, occurrence_date, kind, start_time, end_time";
const SELECT_COLUMNS = `${LEGACY_SELECT_COLUMNS}, moved_to_date`;

// migration 미적용(테이블 없음)은 오류가 아니라 "예외 기능이 아직 꺼진 상태"다 —
// 읽기 경로에서는 조용히 빈 목록으로 두고, 저장 경로에서만 사용자에게 알린다.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

// 이동(moved_to_date) migration만 아직 안 된 상태 — 테이블은 있고 컬럼만 없다.
// 이 경우 이미 쓰고 있던 휴강/시간 변경까지 같이 죽으면 안 되므로, 읽기는 구 컬럼으로
// 한 번 더 시도해 그대로 동작시키고 이동만 저장 시 안내한다.
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

function isMissingMoveColumn(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

// 날짜 범위 batch (대시보드 오늘~+7일, 일지 화면의 특정 날짜 등)
export async function getScheduleExceptionsInRange(startDate: string, endDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ScheduleExceptionEntry[];
  }

  // 원래 날짜가 범위에 있거나(휴강/시간 변경/이동 출발), 옮겨온 날짜가 범위에 있는 경우
  // (이동 도착)를 한 번에 가져온다 — 날짜별 추가 조회 없음.
  const { data, error } = await supabase
    .from("class_schedule_exceptions")
    .select(SELECT_COLUMNS)
    .eq("user_id", user.id)
    .or(
      `and(occurrence_date.gte.${startDate},occurrence_date.lte.${endDate}),` +
        `and(moved_to_date.gte.${startDate},moved_to_date.lte.${endDate})`,
    );

  if (!error) {
    return ((data ?? []) as ExceptionRow[]).map(toEntry);
  }

  // 이동 migration 전: 구 컬럼으로 원래 날짜 범위만 (휴강/시간 변경은 그대로 동작)
  if (isMissingMoveColumn(error)) {
    const legacy = await supabase
      .from("class_schedule_exceptions")
      .select(LEGACY_SELECT_COLUMNS)
      .eq("user_id", user.id)
      .gte("occurrence_date", startDate)
      .lte("occurrence_date", endDate);

    return ((legacy.data ?? []) as ExceptionRow[]).map(toEntry);
  }

  // 테이블 미적용(migration 전)은 조용히 빈 목록 — 예외 없음 = 기존 시간표대로 동작
  if (!isMissingTable(error)) {
    console.error("getScheduleExceptionsInRange error", error);
  }
  return [] as ScheduleExceptionEntry[];
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
    // 원래 날짜가 아직 안 지났거나, 옮겨간 날짜가 미래인 변경까지 "예정된 변경"으로 본다
    .or(`occurrence_date.gte.${fromDate},moved_to_date.gte.${fromDate}`)
    .order("occurrence_date", { ascending: true });

  if (!error) {
    return ((data ?? []) as ExceptionRow[]).map(toEntry);
  }

  if (isMissingMoveColumn(error)) {
    const legacy = await supabase
      .from("class_schedule_exceptions")
      .select(LEGACY_SELECT_COLUMNS)
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .gte("occurrence_date", fromDate)
      .order("occurrence_date", { ascending: true });

    return ((legacy.data ?? []) as ExceptionRow[]).map(toEntry);
  }

  if (!isMissingTable(error)) {
    console.error("getGroupScheduleExceptionsFrom error", error);
  }
  return [] as ScheduleExceptionEntry[];
}

// 특정 occurrence(schedule + 원래 날짜)에 이미 걸려 있는 예외 하나.
// 저장 직전 "이미 옮겨둔 수업을 다시 옮기는 중인가" 판정에만 쓰는 point lookup이다.
export async function getScheduleExceptionForOccurrence(scheduleId: string, date: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const query = (columns: string) =>
    supabase
      .from("class_schedule_exceptions")
      .select(columns)
      .eq("user_id", user.id)
      .eq("schedule_id", scheduleId)
      .eq("occurrence_date", date)
      .maybeSingle();

  let { data, error } = await query(SELECT_COLUMNS);
  if (error && isMissingMoveColumn(error)) {
    ({ data, error } = await query(LEGACY_SELECT_COLUMNS));
  }

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getScheduleExceptionForOccurrence error", error);
    }
    return null;
  }

  return data ? toEntry(data as unknown as ExceptionRow) : null;
}

// 되돌리기 직전 확인용 — id로 예외 하나 (원래 날짜/옮긴 날짜 모두 서버에서 확인하기 위해).
export async function getScheduleExceptionById(exceptionId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const query = (columns: string) =>
    supabase
      .from("class_schedule_exceptions")
      .select(columns)
      .eq("user_id", user.id)
      .eq("id", exceptionId)
      .maybeSingle();

  let { data, error } = await query(SELECT_COLUMNS);
  if (error && isMissingMoveColumn(error)) {
    ({ data, error } = await query(LEGACY_SELECT_COLUMNS));
  }

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getScheduleExceptionById error", error);
    }
    return null;
  }

  return data ? toEntry(data as unknown as ExceptionRow) : null;
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
  // kind === "moved"일 때 옮겨갈 날짜
  movedToDate?: string | null;
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

  const payload: Record<string, unknown> = {
    user_id: user.id,
    group_id: input.groupId,
    schedule_id: input.scheduleId,
    occurrence_date: input.date,
    kind: input.kind,
    start_time: input.kind === "cancelled" ? null : input.startTime ?? null,
    end_time: input.kind === "cancelled" ? null : input.endTime ?? null,
  };

  // 이동 컬럼은 이동일 때만 보낸다 — 이동 migration 전에도 휴강/시간 변경은 그대로 저장된다
  if (input.kind === "moved") {
    payload.moved_to_date = input.movedToDate ?? null;
  }

  const { error } = await supabase
    .from("class_schedule_exceptions")
    .upsert(payload, { onConflict: "schedule_id,occurrence_date" });

  if (error) {
    console.error("upsertScheduleException error", error);
    // 저장 경로에서는 미적용 원인을 숨기지 않는다 ("다시 시도"로 풀리지 않는 문제)
    if (isMissingTable(error)) {
      throw new Error(
        "1회 변경에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260918_create_class_schedule_exceptions.sql을 실행한 뒤 다시 시도해주세요.",
      );
    }
    // 이동만 아직 못 쓰는 상태: 컬럼 없음(42703/PGRST204) 또는 kind check 위반(23514)
    if (input.kind === "moved" && (isMissingMoveColumn(error) || error.code === "23514")) {
      throw new Error(
        "날짜 변경에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260918_add_schedule_exception_move.sql을 실행한 뒤 다시 시도해주세요.",
      );
    }

    // 공휴일 정상 수업 예외만 아직 못 쓰는 상태: kind check 위반
    if (input.kind === "holiday_class" && error.code === "23514") {
      throw new Error(
        "공휴일 정상 수업에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260922_add_holiday_class_exception.sql을 실행한 뒤 다시 시도해주세요.",
      );
    }
    throw new Error("수업 일정을 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return true;
}

// 공휴일 정상 수업 일괄 적용 — 여러 occurrence의 예외를 statement 하나로 넣는다.
// 하나라도 실패하면 전부 실패한다(부분 저장 없음). 이미 예외가 있는 occurrence는
// 호출부에서 제외하므로 여기서 덮어쓰지 않는다.
export async function insertHolidayClassExceptions(
  rows: { groupId: string; scheduleId: string; date: string }[],
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await supabase.from("class_schedule_exceptions").insert(
    rows.map((row) => ({
      user_id: user.id,
      group_id: row.groupId,
      schedule_id: row.scheduleId,
      occurrence_date: row.date,
      kind: "holiday_class",
      start_time: null,
      end_time: null,
    })),
  );

  if (error) {
    console.error("insertHolidayClassExceptions error", error);
    if (isMissingTable(error)) {
      throw new Error(
        "1회 변경에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260918_create_class_schedule_exceptions.sql을 실행한 뒤 다시 시도해주세요.",
      );
    }
    if (error.code === "23514") {
      throw new Error(
        "공휴일 정상 수업에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260922_add_holiday_class_exception.sql을 실행한 뒤 다시 시도해주세요.",
      );
    }
    throw new Error("일괄 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return rows.length;
}

// "원래대로" 일괄 — 예외 row들을 statement 하나로 삭제한다 (반복 시간표는 그대로).
export async function deleteScheduleExceptions(exceptionIds: string[]) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (exceptionIds.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("class_schedule_exceptions")
    .delete()
    .in("id", exceptionIds)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteScheduleExceptions error", error);
    throw new Error("일괄 변경하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return exceptionIds.length;
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

// 여러 반의 같은 날짜 일지 상태를 한 번에 (일괄 변경 preflight용 — 반마다 묻지 않는다).
export async function getDailyLogStatusesForGroupsOnDate(groupIds: string[], date: string) {
  const empty = new Map<string, "draft" | "completed">();
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || groupIds.length === 0) {
    return empty;
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("group_id, status")
    .eq("user_id", user.id)
    .eq("class_date", date)
    .in("group_id", groupIds);

  if (error) {
    console.error("getDailyLogStatusesForGroupsOnDate error", error);
    // 확인 자체가 실패했으면 "일지 없음"으로 단정하지 않는다 — 호출부가 차단한다
    return null;
  }

  const result = new Map<string, "draft" | "completed">();
  for (const row of (data ?? []) as { group_id: string; status: "draft" | "completed" }[]) {
    // 같은 반에 완료/작성 중이 섞여 있으면 완료를 우선해 보여준다
    if (result.get(row.group_id) !== "completed") {
      result.set(row.group_id, row.status);
    }
  }
  return result;
}
