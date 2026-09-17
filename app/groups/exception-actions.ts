"use server";

import { revalidatePath } from "next/cache";

import { dayOfWeekOf, formatTimeHM } from "@/lib/schedule";
import { validateScheduleException, type ScheduleExceptionKind } from "@/lib/schedule-exceptions";
import { todayDateString } from "@/lib/dates";
import {
  deleteScheduleException,
  getDailyLogStatusForOccurrence,
  upsertScheduleException,
} from "@/lib/supabase/queries/schedule-exceptions";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";

// 정규수업 1회 변경(휴강/시간 변경)과 되돌리기.
// - 반복 시간표(class_group_schedules)는 절대 수정하지 않는다.
// - 이미 수업일지가 있는 날짜는 기본 차단한다 (history 충돌 방지) — Draft/Finalized 모두
//   자동 삭제/수정하지 않고 안내만 한다.
// - 실패 시 원본 DB 에러를 노출하지 않는다.

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
}): Promise<{ error: string } | { success: true }> {
  if (input.kind !== "cancelled" && input.kind !== "time_override") {
    return { error: "변경 종류를 선택해주세요." };
  }

  // base schedule 확인 (소유 + 요일/원래 시간 검증 소스)
  const schedules = await getGroupSchedules(input.groupId);
  const schedule = schedules.find((row) => row.id === input.scheduleId);

  if (!schedule) {
    return { error: "수업 시간을 찾을 수 없어요." };
  }

  const validationError = validateScheduleException({
    kind: input.kind,
    date: input.date,
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

  // 이미 그 날짜 일지가 있으면 차단 — 자동 삭제/수정은 절대 하지 않는다
  const existingLog = await getDailyLogStatusForOccurrence(input.groupId, input.date);
  if (existingLog?.status === "completed") {
    return { error: "이미 완료된 수업일지가 있어 변경할 수 없어요." };
  }
  if (existingLog?.status === "draft") {
    return { error: "작성 중인 수업일지가 있어요. 수업일지를 먼저 확인해주세요." };
  }

  try {
    await upsertScheduleException({
      groupId: input.groupId,
      scheduleId: input.scheduleId,
      date: input.date,
      kind: input.kind,
      startTime: input.kind === "time_override" ? formatTimeHM(input.startTime ?? "") : null,
      endTime: input.kind === "time_override" ? formatTimeHM(input.endTime ?? "") : null,
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
  date: string;
}): Promise<{ error: string } | { success: true }> {
  // 되돌린 뒤 그 날짜가 다시 수업이 되는데, 이미 일지가 있으면 동일한 안전 규칙을 적용한다
  const existingLog = await getDailyLogStatusForOccurrence(input.groupId, input.date);
  if (existingLog?.status === "completed") {
    return { error: "이미 완료된 수업일지가 있어 되돌릴 수 없어요." };
  }
  if (existingLog?.status === "draft") {
    return { error: "작성 중인 수업일지가 있어요. 수업일지를 먼저 확인해주세요." };
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
