"use server";

import { revalidatePath } from "next/cache";

import { selectHolidayBulkTargets } from "@/lib/holiday-bulk";
import { getKoreanHolidaysInRange } from "@/lib/korean-holidays";
import { dayOfWeekOf } from "@/lib/schedule";
import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";
import {
  deleteScheduleException,
  deleteScheduleExceptions,
  getDailyLogStatusesForGroupsOnDate,
  getDailyLogStatusForOccurrence,
  getScheduleExceptionForOccurrence,
  getScheduleExceptionsInRange,
  insertHolidayClassExceptions,
  upsertScheduleException,
} from "@/lib/supabase/queries/schedule-exceptions";
import { getCurrentUserSchedulesWithGroup, getGroupSchedules } from "@/lib/supabase/queries/schedules";

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

// 공휴일 일괄 토글 — 그 날짜에 원래 정규수업이 있는 반들을 한 번에 바꾼다.
//
// 대상은 "공휴일 때문에만 쉬는 정규 occurrence"뿐이다:
// - 개별 휴강 / 다른 날짜로 이동한 수업 / 시간만 바꾼 수업은 건드리지 않는다 (그 설정이 우선)
// - 보강·옮겨온 수업 같은 1회성 수업도 대상이 아니다 (반복 시간표에서 나온 수업만 본다)
// - 학원 전체 휴강일이면 아무것도 하지 않는다 (상위 규칙을 일괄 변경으로 뚫지 않는다)
//
// 대상 목록은 서버에서 다시 계산한다 — 화면을 연 뒤 상황이 바뀌었어도 엉뚱한 row를 건드리지 않는다.
// 저장은 insert/delete statement 하나씩이라 전부 성공하거나 전부 그대로다(부분 저장 없음).
export async function setHolidayClassBulkAction(input: {
  date: string;
  // true = 전체 정상 수업날로 변경, false = 전체 공휴일 처리
  enabled: boolean;
}): Promise<{ error: string } | { success: true; changed: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: "날짜를 확인해주세요." };
  }

  const holidays = await getKoreanHolidaysInRange(input.date, input.date);
  if (!holidays.has(input.date)) {
    return { error: "이 날짜는 공휴일이 아니에요." };
  }

  const [closures, schedules, exceptions] = await Promise.all([
    getAcademyClosuresInRange(input.date, input.date),
    getCurrentUserSchedulesWithGroup(),
    getScheduleExceptionsInRange(input.date, input.date),
  ]);

  if (closures.length > 0) {
    return { error: "학원 휴강일로 설정되어 있어 정상 수업으로 변경할 수 없어요." };
  }

  const dow = dayOfWeekOf(input.date);
  // 그 요일의 정규수업만 (보관된 반은 조회 단계에서 이미 빠져 있다)
  const regular = schedules.filter((slot) => slot.day_of_week === dow);
  const exceptionBySchedule = new Map(
    exceptions.filter((entry) => entry.date === input.date).map((entry) => [entry.scheduleId, entry]),
  );

  // 화면과 같은 규칙으로 대상을 고른다 (예외 없음 = 공휴일 때문에만 쉬는 수업)
  const withKind = regular.map((slot) => ({
    slot,
    exceptionKind: exceptionBySchedule.get(slot.id)?.kind ?? null,
  }));

  if (input.enabled) {
    const targets = selectHolidayBulkTargets(withKind, true).map((row) => row.slot);

    if (targets.length === 0) {
      return { error: "정상 수업으로 바꿀 수업이 없어요." };
    }

    try {
      await insertHolidayClassExceptions(
        targets.map((slot) => ({ groupId: slot.group_id, scheduleId: slot.id, date: input.date })),
      );
    } catch (error) {
      return {
        error:
          error instanceof Error && error.message
            ? error.message
            : "일괄 변경하지 못했어요. 잠시 후 다시 시도해주세요.",
      };
    }

    revalidateScheduleSurfaces();
    return { success: true, changed: targets.length };
  }

  // 전체 공휴일 처리 — 이 날짜에 걸린 공휴일 정상 수업 예외만 지운다
  const targets = selectHolidayBulkTargets(withKind, false).map((row) => ({
    slot: row.slot,
    exception: exceptionBySchedule.get(row.slot.id)!,
  }));

  if (targets.length === 0) {
    return { error: "공휴일 휴강으로 바꿀 수업이 없어요." };
  }

  // 일지 확인은 반 목록 한 번에 (반마다 조회하지 않는다)
  const logs = await getDailyLogStatusesForGroupsOnDate(
    [...new Set(targets.map((row) => row.slot.group_id))],
    input.date,
  );

  if (!logs) {
    return { error: "일괄 변경하지 못했어요. 잠시 후 다시 시도해주세요." };
  }

  const nameOf = (groupId: string) =>
    targets.find((row) => row.slot.group_id === groupId)?.slot.group?.name ?? "수업";
  const completed = [...new Set(targets.map((row) => row.slot.group_id))].filter(
    (groupId) => logs.get(groupId) === "completed",
  );
  const drafts = [...new Set(targets.map((row) => row.slot.group_id))].filter(
    (groupId) => logs.get(groupId) === "draft",
  );

  // 하나라도 걸리면 전체를 진행하지 않는다 (부분 되돌리기 금지, 일지 자동 삭제 없음)
  if (completed.length > 0) {
    return {
      error: `완료된 수업일지가 있어 전체를 공휴일 휴강으로 변경할 수 없어요. (${completed
        .map(nameOf)
        .join(", ")})`,
    };
  }
  if (drafts.length > 0) {
    return {
      error: `작성 중인 수업일지가 있어 전체 공휴일 처리를 할 수 없어요. (${drafts
        .map(nameOf)
        .join(", ")})`,
    };
  }

  try {
    await deleteScheduleExceptions(targets.map((row) => row.exception.id));
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "일괄 변경하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidateScheduleSurfaces();
  return { success: true, changed: targets.length };
}
