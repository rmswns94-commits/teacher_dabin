import { dayOfWeekOf, monthLabel, monthRange } from "@/lib/calendar";
import { formatShortDateWithWeekday } from "@/lib/dates";
import {
  buildTeacherLogDay,
  groupTeacherLogsByDate,
  isExportableTeacherLog,
  TEACHER_LOG_EXPORT_SELECT,
  teacherLogPeriodLimitError,
  toTeacherLogEntry,
  type TeacherLogEntry,
  type TeacherLogScheduleSlot,
} from "@/lib/excel/teacher-log-data";
import { fillMonthlyTeacherLogTemplate, fillTeacherLogTemplate } from "@/lib/excel/teacher-log-export";
import {
  excelErrorResponse as errorResponse,
  MONTH_PARAM_PATTERN,
  monthlyExportFilename,
  xlsxDownloadResponse,
} from "@/lib/excel/xlsx-response";
import { buildScheduleExceptionIndex } from "@/lib/schedule-exceptions";
import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";
import { getScheduleExceptionsInRange } from "@/lib/supabase/queries/schedule-exceptions";
import { getKoreanHolidaysInRange } from "@/lib/korean-holidays";
import { getSupplementsInRange } from "@/lib/supabase/queries/supplements";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 앱에서 실제 작성된 Daily Log들을 기존 교사일지 Excel 양식으로 내보낸다.
// - ?date=YYYY-MM-DD : 그 날짜 하루 (기존 일 단위 — 양식 1장)
// - ?month=YYYY-MM   : 그 달(KST 달력 월) 전체 — 기록이 있는 날짜마다 양식 1장씩, 한 시트에 이어서
// 두 경우 모두 같은 builder(lib/excel/teacher-log-data)와 같은 template 블록을 쓴다.
// 파일은 서버에 저장하지 않고 즉시 다운로드로만 반환
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

type ServerSupabase = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

// YYYY-MM-DD 형식 + 실제 달력에 존재하는 날짜인지 (2026-13-40 같은 값 거부).
// UTC 정오 고정으로 파싱해 timezone 밀림 없이 검증한다.
function isValidCalendarDate(date: string) {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// 기간 안의 export 대상 Daily Log — 기간 전체를 1쿼리로 (날짜별 반복 조회 금지)
async function loadExportableLogs(supabase: ServerSupabase, userId: string, start: string, end: string) {
  const query = supabase.from("daily_logs").select(TEACHER_LOG_EXPORT_SELECT).eq("user_id", userId);
  const { data, error } = await (start === end
    ? query.eq("class_date", start)
    : query.gte("class_date", start).lte("class_date", end));

  if (error) {
    console.error("teacher log export logs error", error.code);
    return null;
  }

  return (data ?? []).map(toTeacherLogEntry).filter(isExportableTeacherLog);
}

// 시간 확정 재료: 이 그룹들의 시간표 batch 1쿼리 + 기간의 휴강/이동/보강/공휴일 (기간당 1회씩).
// 요일로 미리 거르지 않는다 — 1회 날짜 이동으로 다른 요일 수업이 이 날짜에 열릴 수 있어,
// 그 schedule row도 후보에 있어야 한다. 실제 시각은 canonical resolver가 정한다.
async function loadScheduleContext(
  supabase: ServerSupabase,
  userId: string,
  entries: readonly TeacherLogEntry[],
  start: string,
  end: string,
) {
  const groupIds = [...new Set(entries.map((entry) => entry.groupId))];
  const [{ data: scheduleRows, error: scheduleError }, exceptions, closures, supplements, holidays] =
    await Promise.all([
      supabase
        .from("class_group_schedules")
        .select("id, group_id, day_of_week, start_time, end_time")
        .eq("user_id", userId)
        .in("group_id", groupIds),
      getScheduleExceptionsInRange(start, end),
      getAcademyClosuresInRange(start, end),
      getSupplementsInRange(start, end),
      getKoreanHolidaysInRange(start, end),
    ]);

  if (scheduleError) {
    console.error("teacher log export schedules error", scheduleError.code);
    return null;
  }

  return {
    slots: (scheduleRows ?? []) as TeacherLogScheduleSlot[],
    exceptionIndex: buildScheduleExceptionIndex(exceptions, closures, supplements, holidays),
  };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return errorResponse("로그인이 필요합니다.", 401);
  }

  const params = new URL(request.url).searchParams;
  const month = params.get("month");

  if (month !== null) {
    return exportMonth(supabase, user.id, month);
  }

  const date = params.get("date") ?? "";

  if (!isValidCalendarDate(date)) {
    return errorResponse("내보낼 날짜를 확인해주세요.");
  }

  // 선택 날짜의 Daily Log만 조회 (전체 기간 조회 금지)
  const exportLogs = await loadExportableLogs(supabase, user.id, date, date);

  if (!exportLogs) {
    return errorResponse("수업 기록을 불러오지 못했어요.", 500);
  }

  if (exportLogs.length === 0) {
    return errorResponse("이 날짜에는 내보낼 수업 기록이 없어요.");
  }

  const limitError = teacherLogPeriodLimitError(exportLogs.length);
  if (limitError) {
    return errorResponse(limitError);
  }

  const context = await loadScheduleContext(supabase, user.id, exportLogs, date, date);
  if (!context) {
    return errorResponse("수업 시간표를 불러오지 못했어요.", 500);
  }

  const day = buildTeacherLogDay(date, exportLogs, context.slots, context.exceptionIndex);
  if (!day.ok) {
    return errorResponse(day.error);
  }

  let buffer: Buffer;
  try {
    buffer = await fillTeacherLogTemplate(day.data);
  } catch (error) {
    console.error("teacher log export template error", error);
    return errorResponse("교사일지 엑셀을 만들지 못했어요. 다시 시도해주세요.", 500);
  }

  const filename = `${date.replaceAll("-", "")}${WEEKDAYS[dayOfWeekOf(date)]}.xlsx`;

  return xlsxDownloadResponse(buffer, filename, "teacher-log.xlsx");
}

// 월간 — 그 달의 export 대상 기록을 batch로 모아, 기록이 있는 날짜마다 양식 1장 (날짜 오름차순).
// 한 날짜라도 시간을 확정할 수 없으면 추측하지 않고 그 날짜를 알려주며 실패한다 (기록 누락 금지).
async function exportMonth(supabase: ServerSupabase, userId: string, month: string) {
  if (!MONTH_PARAM_PATTERN.test(month)) {
    return errorResponse("내보낼 달을 확인해주세요.");
  }

  const range = monthRange(month);
  const exportLogs = await loadExportableLogs(supabase, userId, range.start, range.end);

  if (!exportLogs) {
    return errorResponse("수업 기록을 불러오지 못했어요.", 500);
  }

  if (exportLogs.length === 0) {
    return errorResponse(`${monthLabel(month)}에는 내보낼 수업 기록이 없어요.`);
  }

  const context = await loadScheduleContext(supabase, userId, exportLogs, range.start, range.end);
  if (!context) {
    return errorResponse("수업 시간표를 불러오지 못했어요.", 500);
  }

  const days = [];
  for (const [date, entries] of groupTeacherLogsByDate(exportLogs)) {
    const day = buildTeacherLogDay(date, entries, context.slots, context.exceptionIndex);
    if (!day.ok) {
      return errorResponse(`${formatShortDateWithWeekday(date)} — ${day.error}`);
    }
    days.push(day.data);
  }

  let buffer: Buffer;
  try {
    buffer = await fillMonthlyTeacherLogTemplate({ month, days });
  } catch (error) {
    console.error("teacher log monthly export template error", error);
    return errorResponse("교사일지 엑셀을 만들지 못했어요. 다시 시도해주세요.", 500);
  }

  return xlsxDownloadResponse(
    buffer,
    monthlyExportFilename("강사일지", month),
    `teacher-log-${month}.xlsx`,
  );
}
