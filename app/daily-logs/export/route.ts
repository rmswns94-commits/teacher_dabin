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
import type { ExamTextbook } from "@/lib/supabase/types";

// 선택한 날짜에 앱에서 실제 작성된 Daily Log들을 기존 교사일지 Excel 양식으로 내보낸다.
// - App Daily Log가 source of truth (예정 수업을 임의 생성하지 않음)
// - 수업 시작 시간 오름차순 → 1교시부터 매핑, 교시 1~7 layout은 template에 고정
// - 시간은 그 요일의 group schedule로 확정 (없거나 여러 개면 명확한 오류)
// - 파일은 서버에 저장하지 않고 즉시 다운로드로만 반환
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 교재 셀 값 — 시험 기간 ON이면 시험 대비용 교재, 아니면 일반 교재.
// 여러 권은 일반 교재(class_groups.textbook)와 같은 줄바꿈 표기로 이어 붙인다.
// 시험 기간 ON인데 등록된 교재가 없을 때만 "시험대비"(공백 없음)로 대체한다
// (표시용 fallback — DB에는 저장하지 않는다). OFF면 이 fallback을 쓰지 않는다:
// 저장된 시험 대비용 교재가 남아 있어도 무시하고 일반 교재를 쓴다.
export function examTextbookCell(
  group: {
    textbook: string | null;
    is_exam_period: boolean | null;
    exam_textbooks?: ExamTextbook[] | null;
  } | null,
) {
  const regular = group?.textbook?.trim() ?? "";

  if (!group?.is_exam_period) {
    return regular;
  }

  const examBooks = (group.exam_textbooks ?? [])
    .map((book) => book?.name?.trim() ?? "")
    .filter(Boolean);

  return examBooks.length > 0 ? examBooks.join("\n") : "시험대비";
}

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

  if (!isValidCalendarDate(date)) {
    return errorResponse("내보낼 날짜를 확인해주세요.");
  }

  // 선택 날짜의 Daily Log만 조회 (전체 기간 조회 금지)
  const { data: logRows, error: logError } = await supabase
    .from("daily_logs")
    // 교재 셀 결정에 필요한 그룹 필드까지 embed 1쿼리로 (그룹마다 추가 조회 없음)
    .select(
      "id, group_id, status, default_progress, lesson_content, class_groups(id, name, textbook, is_exam_period, exam_textbooks)",
    )
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
      | {
          id: string;
          name: string;
          textbook: string | null;
          is_exam_period: boolean | null;
          exam_textbooks: ExamTextbook[] | null;
        }
      | null;

    return {
      group_id: row.group_id,
      status: row.status,
      progress: mergeLegacyLessonContent(row.default_progress, row.lesson_content),
      groupName: group?.name ?? "수업 그룹",
      // 교재 셀은 export 시점의 그룹 상태 기준 (historical snapshot 아님 — 기존 정책 유지).
      // 시험 기간 ON: 등록된 시험 대비용 교재 이름들, 하나도 없으면 "시험대비" fallback.
      // OFF: 기존 일반 교재 그대로. 그룹마다 독립 (하나가 ON이어도 다른 그룹은 영향 없음).
      textbook: examTextbookCell(group),
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
