// 보충 수업 Excel 행 조립 — 전체 완료 기록 export와 월간 export가 같은 함수를 쓴다
// (같은 보충 기록은 어느 export에서든 같은 칸/같은 값/같은 순서로 나온다).
//
// - Excel row 1개 = 완료된 makeup record 1개 (학생 이름 기준 merge 없음)
// - 날짜 = completed_date(실제 보충 진행일, date-only KST) / 결석일 = original_class_date
//   (결석 연동 보충의 원래 수업 lesson_date snapshot — 직접 등록 보충은 결석이 아니므로 공란)
// - 수업시간 = 해당 보충이 연결된 원래 그룹 시간표에서 "결석일 요일"과 일치하는 slot
//   (직접 등록 보충은 등록된 보충 시간 자체를 사용)
// - 보충 내용 = 결석 당시 snapshot(missed_progress) 우선, 없으면 실제 보충한 내용
// - 정렬: 보충 진행 날짜 ASC → 수업시간 ASC → 학생 이름 가나다
import { dayOfWeekOf } from "@/lib/calendar";
import { formatTimeRange, type ScheduleSlot } from "@/lib/schedule";
import type { CompletedMakeupForExport } from "@/lib/supabase/queries/makeups";

import type { MakeupExportRow } from "./makeup-export";

type MakeupScheduleSlot = Pick<ScheduleSlot, "group_id" | "day_of_week" | "start_time" | "end_time">;

const nameCollator = new Intl.Collator("ko-KR");

export function buildMakeupExportRows(
  makeups: readonly CompletedMakeupForExport[],
  schedules: readonly MakeupScheduleSlot[],
): MakeupExportRow[] {
  // 그룹별 시간표 map — 요일 매칭용 (전체 시간표 1쿼리, 보충 건수와 무관)
  const slotsByGroup = new Map<string, MakeupScheduleSlot[]>();
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

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.timeLabel.localeCompare(b.timeLabel) ||
      nameCollator.compare(a.name, b.name),
  );

  return rows;
}
