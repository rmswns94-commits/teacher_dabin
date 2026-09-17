"use server";

import { revalidatePath } from "next/cache";

import { getKoreanHolidaysInRange } from "@/lib/korean-holidays";
import { dayOfWeekOf } from "@/lib/schedule";
import {
  deleteScheduleException,
  getDailyLogStatusForOccurrence,
  getScheduleExceptionForOccurrence,
  upsertScheduleException,
} from "@/lib/supabase/queries/schedule-exceptions";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";

// 공휴일 정상 수업 토글 — "이 반의 이 날 수업은 공휴일이어도 진행한다"를 켜고 끈다.
//
// - 저장은 기존 1회 예외 테이블의 kind='holiday_class' row 하나뿐이다.
//   공휴일 날짜 자체는 저장하지 않는다(달력 사실이라 앱이 계산한다).
// - occurrence 단위다: schedule_id + occurrence_date. 같은 날 다른 반은 영향이 없고,
//   같은 반이 같은 요일에 수업이 둘이면 각각 따로 켠다.
// - 반복 시간표(class_group_schedules)는 어느 쪽으로도 수정하지 않는다.
// - 공휴일 휴강으로 되돌릴 때 이미 수업일지가 있으면 차단한다(기록과 모순 방지, 자동 삭제 없음).

function revalidateScheduleSurfaces() {
  revalidatePath("/daily-logs", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/todos");
}

export async function setHolidayClassAction(input: {
  groupId: string;
  scheduleId: string;
  date: string;
  // true = 정상 수업날로 변경, false = 다시 공휴일 휴강
  enabled: boolean;
}): Promise<{ error: string } | { success: true }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: "날짜를 확인해주세요." };
  }

  // 공휴일이 아닌 날짜에는 이 예외가 의미가 없다 (기본이 이미 정상 수업)
  const holidays = await getKoreanHolidaysInRange(input.date, input.date);
  if (!holidays.has(input.date)) {
    return { error: "이 날짜는 공휴일이 아니에요." };
  }

  // 그 요일에 실제로 이 반 수업이 있는 schedule row인지 확인 (소유 검증 겸)
  const schedules = await getGroupSchedules(input.groupId);
  const schedule = schedules.find((row) => row.id === input.scheduleId);

  if (!schedule) {
    return { error: "수업 시간을 찾을 수 없어요." };
  }

  if (schedule.day_of_week !== dayOfWeekOf(input.date)) {
    return { error: "이 날짜에는 이 반의 정규수업이 없어요." };
  }

  if (input.enabled) {
    // 이미 다른 종류의 예외(휴강·시간 변경·이동)가 걸려 있으면 덮어쓰지 않는다 —
    // occurrence당 예외는 하나뿐이라 조용히 지우면 사용자가 설정한 내용이 사라진다.
    const existing = await getScheduleExceptionForOccurrence(input.scheduleId, input.date);
    if (existing && existing.kind !== "holiday_class") {
      return {
        error:
          existing.kind === "moved"
            ? "이 수업은 다른 날짜로 옮겨져 있어요. 먼저 수업 변경을 되돌려주세요."
            : "이 수업에는 이미 다른 1회 변경이 있어요. 먼저 그 변경을 되돌려주세요.",
      };
    }

    try {
      await upsertScheduleException({
        groupId: input.groupId,
        scheduleId: input.scheduleId,
        date: input.date,
        kind: "holiday_class",
        startTime: null,
        endTime: null,
        movedToDate: null,
      });
    } catch (error) {
      return {
        error:
          error instanceof Error && error.message
            ? error.message
            : "정상 수업으로 변경하지 못했어요. 잠시 후 다시 시도해주세요.",
      };
    }

    revalidateScheduleSurfaces();
    return { success: true };
  }

  // 공휴일 휴강으로 되돌리기 — 그날 일지가 있으면 차단
  const existing = await getScheduleExceptionForOccurrence(input.scheduleId, input.date);
  if (!existing || existing.kind !== "holiday_class") {
    // 이미 공휴일 휴강 상태 (되돌릴 것이 없다)
    revalidateScheduleSurfaces();
    return { success: true };
  }

  const log = await getDailyLogStatusForOccurrence(input.groupId, input.date);
  if (log?.status === "completed") {
    return { error: "이미 완료된 수업일지가 있어 공휴일 휴강으로 변경할 수 없어요." };
  }
  if (log) {
    return { error: "작성 중인 수업일지가 있어요. 공휴일 휴강으로 변경하기 전에 먼저 확인해주세요." };
  }

  try {
    await deleteScheduleException(existing.id);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "공휴일 휴강으로 변경하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidateScheduleSurfaces();
  return { success: true };
}
