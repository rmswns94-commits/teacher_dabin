import { NextResponse } from "next/server";

import { dayOfWeekOf } from "@/lib/calendar";
import { fillMakeupTemplate, type MakeupExportRow } from "@/lib/excel/makeup-export";
import { formatTimeRange, type ScheduleSlot } from "@/lib/schedule";
import { getCompletedMakeupsForExport } from "@/lib/supabase/queries/makeups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 보충 수업 Excel 내보내기 — 기존 양식("보충 수업.xlsx") template에 값만 채운다.
// - 대상: status = completed 만 (required/scheduled/cancelled 제외) — 전체 완료 history
// - Excel row 1개 = 완료된 makeup record 1개 (학생 이름 기준 merge 없음)
// - 날짜 = completed_date(실제 보충 진행일, date-only KST) / 결석일 = original_class_date
//   (결석 연동 보충의 원래 수업 lesson_date snapshot — 직접 등록 보충은 결석이 아니므로 공란)
// - 수업시간 = 해당 보충이 연결된 원래 그룹 시간표에서 "결석일 요일"과 일치하는 slot
//   (직접 등록 보충은 등록된 보충 시간 자체를 사용)
// - 보충 내용 = 결석 당시 snapshot(missed_progress) 우선, 없으면 실제 보충한 내용
// - read-only: 어떤 makeup/attendance/daily log row도 수정하지 않는다
function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return errorResponse("로그인이 필요합니다.", 401);
  }

  let makeups;
  let schedules;
  try {
    [makeups, schedules] = await Promise.all([
      getCompletedMakeupsForExport(),
      getCurrentUserSchedulesWithGroup(),
    ]);
  } catch (error) {
    console.error("makeup export query error", error);
    return errorResponse("완료된 보충 수업을 불러오지 못했어요. 다시 시도해주세요.", 500);
  }

  if (makeups.length === 0) {
    return errorResponse("내보낼 완료된 보충 수업이 없어요.");
  }

  // 그룹별 시간표 map — 요일 매칭용 (전체 시간표 1쿼리, 보충 건수와 무관)
  const slotsByGroup = new Map<string, Pick<ScheduleSlot, "day_of_week" | "start_time" | "end_time">[]>();
  for (const slot of schedules) {
    slotsByGroup.set(slot.group_id, [...(slotsByGroup.get(slot.group_id) ?? []), slot]);
  }

  const rows: MakeupExportRow[] = makeups.map((makeup) => {
    let timeLabel = "";
    let absenceDate = "";

    if (makeup.source === "manual") {
      // 직접 등록 보충: 결석 연동이 없어 "원래 수업" 개념이 없다 —
      // 결석일은 공란(보드와 동일 정책), 수업시간은 등록된 보충 시간 자체.
      if (makeup.start_time && makeup.end_time) {
        timeLabel = formatTimeRange(makeup.start_time, makeup.end_time);
      }
    } else {
      absenceDate = makeup.original_class_date ?? "";
      if (makeup.groupId && absenceDate) {
        // 결석일 요일과 일치하는 그 그룹의 schedule slot (요일별 시간이 달라도 정확히).
        // 같은 요일 slot이 여러 개면 전부 표기. 시간표가 바뀌어 일치 요일이 없으면 공란.
        const dow = dayOfWeekOf(absenceDate);
        const matched = (slotsByGroup.get(makeup.groupId) ?? [])
          .filter((slot) => slot.day_of_week === dow)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        timeLabel = [
          ...new Set(matched.map((slot) => formatTimeRange(slot.start_time, slot.end_time))),
        ].join(", ");
      }
    }

    return {
      date: makeup.completed_date ?? "",
      timeLabel,
      name: makeup.studentName ?? "",
      content: makeup.missed_progress?.trim() || makeup.completed_progress?.trim() || "",
      absenceDate,
    };
  });

  // 보충 진행 날짜 ASC → 수업시간 ASC → 학생 이름 가나다
  const collator = new Intl.Collator("ko-KR");
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.timeLabel.localeCompare(b.timeLabel) ||
      collator.compare(a.name, b.name),
  );

  let buffer: Buffer;
  try {
    buffer = await fillMakeupTemplate(rows);
  } catch (error) {
    if (error instanceof Error && error.message) {
      console.error("makeup export template error", error.message);
      return errorResponse(error.message, 500);
    }
    return errorResponse("보충 수업 엑셀을 만들지 못했어요. 다시 시도해주세요.", 500);
  }

  const filename = "강사일지_보충수업.xlsx";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="makeups.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
