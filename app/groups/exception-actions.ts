"use server";

import { revalidatePath } from "next/cache";

import { dayOfWeekOf, formatTimeHM } from "@/lib/schedule";
import {
  buildScheduleExceptionIndex,
  movedInOccurrences,
  resolveOccurrence,
  validateScheduleException,
  type ScheduleExceptionKind,
} from "@/lib/schedule-exceptions";
import { formatShortDateWithWeekday, todayDateString } from "@/lib/dates";
import {
  deleteScheduleException,
  getDailyLogStatusForOccurrence,
  getScheduleExceptionById,
  getScheduleExceptionForOccurrence,
  getScheduleExceptionsInRange,
  upsertScheduleException,
} from "@/lib/supabase/queries/schedule-exceptions";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";

// 정규수업 1회 변경(휴강/시간 변경)과 되돌리기.
// - 반복 시간표(class_group_schedules)는 절대 수정하지 않는다.
// - 이미 수업일지가 있는 날짜는 기본 차단한다 (history 충돌 방지) — Draft/Finalized 모두
//   자동 삭제/수정하지 않고 안내만 한다.
// - 실패 시 원본 DB 에러를 노출하지 않는다.

// 옮기려는 날짜에 이 반 수업이 이미 있는지 — 반복 시간표 + 그날로 옮겨온 수업 모두 본다.
// 지금 저장하려는 예외 자신(같은 schedule의 같은 원래 날짜)은 후보에서 빼야, 이미 옮겨둔
// 수업의 시간만 바꾸는 재저장이 자기 자신 때문에 막히지 않는다.
async function groupAlreadyHasClassOn(
  groupId: string,
  targetDate: string,
  schedules: { id: string; day_of_week: number; start_time: string; end_time: string }[],
  scheduleId: string,
  originDate: string,
) {
  const entries = await getScheduleExceptionsInRange(targetDate, targetDate);
  const index = buildScheduleExceptionIndex(
    entries.filter((entry) => !(entry.scheduleId === scheduleId && entry.date === originDate)),
  );

  const targetDow = dayOfWeekOf(targetDate);
  const hasBaseClass = schedules.some(
    (slot) =>
      slot.day_of_week === targetDow &&
      !resolveOccurrence(index, slot.id, targetDate, slot.start_time, slot.end_time).cancelled,
  );

  if (hasBaseClass) {
    return true;
  }

  const groupScheduleIds = new Set(schedules.map((slot) => slot.id));
  return movedInOccurrences(index, targetDate).some((moved) => groupScheduleIds.has(moved.scheduleId));
}

function revalidateScheduleSurfaces(groupId: string) {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
  revalidatePath("/dashboard");
  revalidatePath("/daily-logs", "layout");
  revalidatePath("/todos");
}

export async function saveScheduleExceptionAction(input: {
  groupId: string;
  scheduleId: string;
  date: string;
  kind: ScheduleExceptionKind;
  startTime?: string;
  endTime?: string;
  movedToDate?: string;
}): Promise<{ error: string } | { success: true }> {
  if (!["cancelled", "time_override", "moved"].includes(input.kind)) {
    return { error: "변경 종류를 선택해주세요." };
  }

  // base schedule 확인 (소유 + 요일/원래 시간 검증 소스)
  const schedules = await getGroupSchedules(input.groupId);
  const schedule = schedules.find((row) => row.id === input.scheduleId);

  if (!schedule) {
    return { error: "수업 시간을 찾을 수 없어요." };
  }

  // 같은 날짜로 옮기는 건 "시간 변경"과 같다 — 저장 종류를 정규화한다 (이동 row 남기지 않음)
  const kind: ScheduleExceptionKind =
    input.kind === "moved" && input.movedToDate === input.date ? "time_override" : input.kind;

  // 이미 다른 날짜로 옮겨둔 수업을 다시 옮기는 중이면 원래 날짜는 이미 지났을 수 있다
  const existingException = await getScheduleExceptionForOccurrence(input.scheduleId, input.date);

  const validationError = validateScheduleException({
    kind,
    date: input.date,
    movedToDate: input.movedToDate,
    originAlreadyMoved: existingException?.kind === "moved",
    scheduleDayOfWeek: schedule.day_of_week,
    baseStartTime: schedule.start_time,
    baseEndTime: schedule.end_time,
    startTime: input.startTime,
    endTime: input.endTime,
    today: todayDateString(),
    dayOfWeekOfDate: dayOfWeekOf,
  });

  if (validationError) {
    return { error: validationError };
  }

  // 원래 날짜에 이미 일지가 있으면 차단 — 자동 삭제/수정은 절대 하지 않는다
  const existingLog = await getDailyLogStatusForOccurrence(input.groupId, input.date);
  if (existingLog?.status === "completed") {
    return { error: "이미 완료된 수업일지가 있어 변경할 수 없어요." };
  }
  if (existingLog?.status === "draft") {
    return { error: "작성 중인 수업일지가 있어요. 수업일지를 먼저 확인해주세요." };
  }

  // 옮겨갈 날짜에 이미 이 반의 일지가 있으면(그날 수업을 이미 기록함) 역시 차단
  if (kind === "moved" && input.movedToDate) {
    const targetLog = await getDailyLogStatusForOccurrence(input.groupId, input.movedToDate);
    if (targetLog) {
      return {
        error:
          targetLog.status === "completed"
            ? "옮기려는 날짜에 이미 완료된 수업일지가 있어요."
            : "옮기려는 날짜에 작성 중인 수업일지가 있어요. 수업일지를 먼저 확인해주세요.",
      };
    }

    // 그날 이 반 수업이 이미 있으면 차단한다. 수업일지 identity가 (반 + 날짜) 하나라서
    // 같은 반 수업이 하루에 둘이 되면 두 수업을 따로 기록할 수 없다.
    if (await groupAlreadyHasClassOn(input.groupId, input.movedToDate, schedules, input.scheduleId, input.date)) {
      return { error: "그날은 이 반 수업이 이미 있어요. 수업일지는 반·날짜마다 하나라서 다른 날짜를 골라주세요." };
    }
  }

  try {
    await upsertScheduleException({
      groupId: input.groupId,
      scheduleId: input.scheduleId,
      date: input.date,
      kind,
      startTime: kind === "cancelled" ? null : formatTimeHM(input.startTime ?? ""),
      endTime: kind === "cancelled" ? null : formatTimeHM(input.endTime ?? ""),
      movedToDate: kind === "moved" ? input.movedToDate ?? null : null,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "수업 일정을 변경하지 못했어요.",
    };
  }

  revalidateScheduleSurfaces(input.groupId);
  return { success: true };
}

export async function removeScheduleExceptionAction(input: {
  groupId: string;
  exceptionId: string;
}): Promise<{ error: string } | { success: true }> {
  const entry = await getScheduleExceptionById(input.exceptionId);
  if (!entry) {
    return { error: "변경 내역을 찾을 수 없어요." };
  }

  // 되돌리면 원래 날짜가 다시 수업이 되고, 옮겨둔 날짜의 수업은 사라진다 —
  // 두 날짜 모두 일지가 있으면 차단한다 (일지를 고아로 만들지 않는다).
  const affectedDates = entry.kind === "moved" && entry.movedToDate
    ? [entry.date, entry.movedToDate]
    : [entry.date];

  for (const date of affectedDates) {
    const existingLog = await getDailyLogStatusForOccurrence(input.groupId, date);
    const label = formatShortDateWithWeekday(date);

    if (existingLog?.status === "completed") {
      return { error: `${label}에 이미 완료된 수업일지가 있어 수업 변경을 되돌릴 수 없어요.` };
    }
    if (existingLog?.status === "draft") {
      return { error: `${label}에 작성 중인 수업일지가 있어요. 되돌리기 전에 먼저 확인해주세요.` };
    }
  }

  try {
    await deleteScheduleException(input.exceptionId);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "수업 일정을 되돌리지 못했어요.",
    };
  }

  revalidateScheduleSurfaces(input.groupId);
  return { success: true };
}
