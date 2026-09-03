import { NextResponse } from "next/server";

import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import {
  buildTeacherLogWorkbook,
  formatDateLabel,
  formatPeriodTime,
  writeWorkbookBuffer,
  type TeacherLogDay,
  type TeacherLogPeriod,
} from "@/lib/excel/build-teacher-log";
import { mergeLegacyLessonContent } from "@/lib/progress";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 앱에 기록된 수업 데이터를 기존 교사일지 Excel 양식으로 내보낸다.
// - 교시 1~7 고정: 그 요일의 수업 시간표를 시작 시간순으로 1교시부터 채운다
// - 시간 = 수업 시간표, 교재 = 그룹 교재, 수업내용(진도) = 해당 일지의 공통 진도
// - 출근 2:00 / 퇴근 9:20 / 교사명 김다빈 고정 (양식 요구사항)
// 파일은 서버에 저장하지 않고 즉시 다운로드로만 반환한다.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;
const PERIOD_COUNT = 7;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? start;

  if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end) || start > end) {
    return NextResponse.json({ error: "날짜 범위를 확인해주세요." }, { status: 400 });
  }

  const dates: string[] = [];
  for (let date = start; date <= end && dates.length <= MAX_DAYS; date = addDaysStr(date, 1)) {
    dates.push(date);
  }

  if (dates.length > MAX_DAYS) {
    return NextResponse.json({ error: "한 번에 31일까지 내보낼 수 있어요." }, { status: 400 });
  }

  // 고정 2쿼리 batch: 시간표(그룹 포함) + 기간 내 일지
  const [{ data: scheduleRows, error: scheduleError }, { data: logRows, error: logError }] =
    await Promise.all([
      supabase
        .from("class_group_schedules")
        .select("group_id, day_of_week, start_time, end_time, class_groups(id, name, textbook)")
        .eq("user_id", user.id)
        .order("start_time", { ascending: true }),
      supabase
        .from("daily_logs")
        .select("group_id, class_date, default_progress, lesson_content, class_groups(textbook)")
        .eq("user_id", user.id)
        .gte("class_date", start)
        .lte("class_date", end),
    ]);

  if (scheduleError || logError) {
    console.error("teacher log export query error", scheduleError ?? logError);
    return NextResponse.json({ error: "내보낼 데이터를 불러오지 못했어요." }, { status: 500 });
  }

  type ScheduleRow = {
    group_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    group: { id: string; name: string; textbook: string | null } | null;
  };

  const schedules: ScheduleRow[] = (scheduleRows ?? []).map((row) => {
    const groups = row.class_groups as unknown;
    return {
      group_id: row.group_id,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      group: (Array.isArray(groups) ? groups[0] : groups) as ScheduleRow["group"],
    };
  });

  // 시간표 없는 그룹(보충 등)의 일지도 교재를 채울 수 있게 일지 embed에서 교재를 수집
  const textbookByGroup = new Map<string, string>();
  for (const row of logRows ?? []) {
    const groups = row.class_groups as unknown;
    const group = (Array.isArray(groups) ? groups[0] : groups) as { textbook: string | null } | null;
    textbookByGroup.set(row.group_id, group?.textbook?.trim() ?? "");
  }

  const progressByGroupDate = new Map(
    (logRows ?? []).map((row) => [
      `${row.group_id}|${row.class_date}`,
      mergeLegacyLessonContent(row.default_progress, row.lesson_content),
    ]),
  );

  const days: TeacherLogDay[] = dates.map((date) => {
    const dow = dayOfWeekOf(date);
    const slots = schedules
      .filter((row) => row.day_of_week === dow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    const periods: TeacherLogPeriod[] = Array.from({ length: PERIOD_COUNT }, () => ({
      time: "",
      textbook: "",
      progress: "",
    }));

    const coveredGroups = new Set<string>();
    slots.slice(0, PERIOD_COUNT).forEach((slot, index) => {
      coveredGroups.add(slot.group_id);
      periods[index] = {
        time: formatPeriodTime(slot.start_time, slot.end_time),
        textbook: slot.group?.textbook?.trim() ?? "",
        progress: progressByGroupDate.get(`${slot.group_id}|${date}`) ?? "",
      };
    });

    // 시간표에 없는 그룹의 일지(보충 등)도 누락 없이 빈 교시에 채운다 (시간 공란)
    for (const row of logRows ?? []) {
      if (row.class_date !== date || coveredGroups.has(row.group_id)) {
        continue;
      }

      const emptyIndex = periods.findIndex(
        (period) => !period.time && !period.progress && !period.textbook,
      );
      if (emptyIndex === -1) {
        break;
      }

      coveredGroups.add(row.group_id);
      periods[emptyIndex] = {
        time: "",
        textbook: textbookByGroup.get(row.group_id) ?? "",
        progress: mergeLegacyLessonContent(row.default_progress, row.lesson_content),
      };
    }

    return { dateLabel: formatDateLabel(date, dow), periods };
  });

  const buffer = writeWorkbookBuffer(buildTeacherLogWorkbook(days));

  // 예시 파일과 같은 패턴의 이름: 20260901화~0902수.xlsx (하루면 20260901화.xlsx)
  const startName = `${start.replaceAll("-", "")}${WEEKDAYS[dayOfWeekOf(start)]}`;
  const endName = `${end.slice(5, 7)}${end.slice(8, 10)}${WEEKDAYS[dayOfWeekOf(end)]}`;
  const filename = start === end ? `${startName}.xlsx` : `${startName}~${endName}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="teacher-log.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
