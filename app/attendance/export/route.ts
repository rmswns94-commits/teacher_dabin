import { NextResponse } from "next/server";

import {
  attendanceSymbols,
  buildMonthlyAttendanceRows,
  slotsByGroupOf,
  type MonthlyAttendanceRow,
} from "@/lib/attendance";
import { monthRange } from "@/lib/calendar";
import {
  chunkAttendanceGroups,
  fillAttendanceTemplate,
  formatAttendanceTimeRange,
  type AttendanceExportGroup,
} from "@/lib/excel/attendance-export";
import { gradeDisplay } from "@/lib/grades";
import { groupSchedulesByTime } from "@/lib/schedule";
import { getMonthlyAttendanceEntries } from "@/lib/supabase/queries/attendance";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { StudentGrade } from "@/lib/supabase/types";

// 월간 출석부 Excel 내보내기 — 기존 양식(출석부.xlsx) template에 값만 채운다.
// - 출결 현황 페이지와 같은 조회 함수(getMonthlyAttendanceEntries)를 사용 — 화면과 항상 같은 데이터
// - 행 = 학생 × 반 (같은 학생이 여러 반이면 반마다 별도 행 — 이름 기준 merge 금지)
// - 기호: 출석 O · 지각 △ · 조퇴 Φ · 결석 X · 미기록 공란 (template 범례와 동일, lib/attendance)
// - 수업시간 칸은 요일 없이 시간만 ("2:30-3:20" — 원본 표기)
// - 파일은 서버에 저장하지 않고 즉시 다운로드로만 반환
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return errorResponse("로그인이 필요합니다.", 401);
  }

  const month = new URL(request.url).searchParams.get("month") ?? "";

  if (!MONTH_PATTERN.test(month)) {
    return errorResponse("내보낼 달을 확인해주세요.");
  }

  const range = monthRange(month);

  const [entries, schedules] = await Promise.all([
    getMonthlyAttendanceEntries(range.start, range.end),
    getCurrentUserSchedulesWithGroup(),
  ]);

  if (entries.length === 0) {
    return errorResponse("이 달에는 내보낼 출결 기록이 없어요.");
  }

  const slotsByGroup = slotsByGroupOf(schedules);
  // 반(수업 시작 시간 ASC → 반 이름) → 학생(가나다순) 정렬된 flat rows — 반 단위로 인접
  const rows = buildMonthlyAttendanceRows(entries, slotsByGroup);

  // 수업시간 라벨: 요일 없이 시간만. 같은 시간대는 하나로, 여러 시간대면 ", "로 연결.
  const timeLabelOf = (groupId: string) => {
    const slots = slotsByGroup.get(groupId) ?? [];
    const ranges = groupSchedulesByTime(slots).map((block) =>
      formatAttendanceTimeRange(block.startTime, block.endTime),
    );
    return [...new Set(ranges)].join(", ");
  };

  // 정렬 순서를 유지한 채 반 단위로 묶는다
  const groups: AttendanceExportGroup[] = [];
  const groupIndex = new Map<string, number>();
  for (const row of rows) {
    let index = groupIndex.get(row.groupId);
    if (index === undefined) {
      index = groups.length;
      groupIndex.set(row.groupId, index);
      groups.push({ timeLabel: timeLabelOf(row.groupId), students: [] });
    }
    groups[index].students.push({
      name: row.studentName,
      gradeLabel: gradeDisplay[row.studentGrade as StudentGrade] ?? row.studentGrade,
      marks: markSymbolsOf(row),
    });
  }

  const [year, monthNum] = month.split("-").map(Number);

  let buffer: Buffer;
  try {
    buffer = await fillAttendanceTemplate({
      year,
      month: monthNum,
      blocks: chunkAttendanceGroups(groups),
    });
  } catch (error) {
    if (error instanceof Error && error.message) {
      console.error("attendance export template error", error.message);
      return errorResponse(error.message, 500);
    }
    return errorResponse("출석부 엑셀을 만들지 못했어요. 다시 시도해주세요.", 500);
  }

  const filename = `출석부_${month}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

// 일(day) → 출결 기호 map (미기록 날짜는 키 없음 → 공란)
function markSymbolsOf(row: MonthlyAttendanceRow) {
  const marks = new Map<number, string>();
  for (const [day, status] of row.marks) {
    marks.set(day, attendanceSymbols[status]);
  }
  return marks;
}
