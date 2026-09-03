import { NextResponse } from "next/server";

import { dayOfWeekOf } from "@/lib/calendar";
import {
  fillTeacherLogTemplate,
  formatDateLabel,
  TEACHER_LOG_CONSTANTS,
  type TeacherLogExportRow,
} from "@/lib/excel/teacher-log-export";
import { mergeLegacyLessonContent } from "@/lib/progress";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 선택한 날짜에 앱에서 실제 작성된 Daily Log들을 기존 교사일지 Excel 양식으로 내보낸다.
// - App Daily Log가 source of truth (예정 수업을 임의 생성하지 않음)
// - 수업 시작 시간 오름차순 → 1교시부터 매핑, 교시 1~7 layout은 template에 고정
// - 시간은 그 요일의 group schedule로 확정 (없거나 여러 개면 명확한 오류)
// - 파일은 서버에 저장하지 않고 즉시 다운로드로만 반환
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return errorResponse("로그인이 필요합니다.", 401);
  }

  const date = new URL(request.url).searchParams.get("date") ?? "";

  if (!DATE_PATTERN.test(date)) {
    return errorResponse("내보낼 날짜를 확인해주세요.");
  }

  // 선택 날짜의 Daily Log만 조회 (전체 기간 조회 금지)
  const { data: logRows, error: logError } = await supabase
    .from("daily_logs")
    .select("id, group_id, status, default_progress, lesson_content, class_groups(id, name, textbook)")
    .eq("user_id", user.id)
    .eq("class_date", date);

  if (logError) {
    console.error("teacher log export logs error", logError.code);
    return errorResponse("수업 기록을 불러오지 못했어요.", 500);
  }

  type LogRow = {
    group_id: string;
    status: string;
    progress: string;
    groupName: string;
    textbook: string;
  };

  const logs: LogRow[] = (logRows ?? []).map((row) => {
    const groups = row.class_groups as unknown;
    const group = (Array.isArray(groups) ? groups[0] : groups) as
      | { id: string; name: string; textbook: string | null }
      | null;

    return {
      group_id: row.group_id,
      status: row.status,
      progress: mergeLegacyLessonContent(row.default_progress, row.lesson_content),
      groupName: group?.name ?? "수업 그룹",
      textbook: group?.textbook?.trim() ?? "",
    };
  });

  // 실제 작성된 기록만: completed는 항상, draft는 내용(공통 진도)이 있을 때만 (빈/미작성 draft 제외)
  const exportLogs = logs.filter((log) => log.status === "completed" || log.progress.trim() !== "");

  if (exportLogs.length === 0) {
    return errorResponse("이 날짜에는 내보낼 수업 기록이 없어요.");
  }

  if (exportLogs.length > TEACHER_LOG_CONSTANTS.MAX_PERIODS) {
    return errorResponse(
      `교사일지는 하루 최대 ${TEACHER_LOG_CONSTANTS.MAX_PERIODS}교시까지 내보낼 수 있어요. 현재 ${exportLogs.length}개의 수업 기록이 있어요.`,
    );
  }

  // 시간 확정: 해당 요일의 group schedule을 batch 1쿼리로 조회 (log별 반복 쿼리 금지)
  const dow = dayOfWeekOf(date);
  const groupIds = [...new Set(exportLogs.map((log) => log.group_id))];
  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("class_group_schedules")
    .select("group_id, start_time, end_time")
    .eq("user_id", user.id)
    .eq("day_of_week", dow)
    .in("group_id", groupIds);

  if (scheduleError) {
    console.error("teacher log export schedules error", scheduleError.code);
    return errorResponse("수업 시간표를 불러오지 못했어요.", 500);
  }

  const timesByGroup = new Map<string, { start_time: string; end_time: string }[]>();
  for (const row of scheduleRows ?? []) {
    const key = row.group_id as string;
    const list = timesByGroup.get(key) ?? [];
    // 완전 중복 schedule row는 하나로
    if (!list.some((item) => item.start_time === row.start_time && item.end_time === row.end_time)) {
      list.push({ start_time: row.start_time, end_time: row.end_time });
    }
    timesByGroup.set(key, list);
  }

  const rows: (TeacherLogExportRow & { startSort: string })[] = [];
  for (const log of exportLogs) {
    const times = timesByGroup.get(log.group_id) ?? [];

    // 시간 임의 추측 금지 — 없거나 애매하면 명확한 오류
    if (times.length === 0) {
      return errorResponse(`${log.groupName}의 수업 시간을 확인할 수 없어 엑셀을 만들지 못했어요.`);
    }
    if (times.length > 1) {
      return errorResponse(
        `${log.groupName}의 수업 시간을 확정할 수 없어요. (이 요일 시간표가 ${times.length}개예요)`,
      );
    }

    rows.push({
      startTime: times[0].start_time,
      endTime: times[0].end_time,
      textbook: log.textbook,
      progress: log.progress,
      startSort: times[0].start_time,
    });
  }

  // 수업 시작 시간 오름차순 → 1교시부터 (저장 순서와 무관)
  rows.sort((a, b) => a.startSort.localeCompare(b.startSort));

  let buffer: Buffer;
  try {
    buffer = await fillTeacherLogTemplate({
      dateLabel: formatDateLabel(date, dow),
      rows: rows.map((row) => ({
        startTime: row.startTime,
        endTime: row.endTime,
        textbook: row.textbook,
        progress: row.progress,
      })),
    });
  } catch (error) {
    console.error("teacher log export template error", error);
    return errorResponse("교사일지 엑셀을 만들지 못했어요. 다시 시도해주세요.", 500);
  }

  const filename = `${date.replaceAll("-", "")}${WEEKDAYS[dow]}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="teacher-log.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
