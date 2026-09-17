"use server";

import { revalidatePath } from "next/cache";

import { formatShortDateWithWeekday, todayDateString } from "@/lib/dates";
import {
  deleteAcademyClosure,
  getDailyLogStatusesOnDate,
  upsertAcademyClosure,
} from "@/lib/supabase/queries/academy-closures";

// 학원 전체 휴강일 등록/해제.
// - 반복 시간표(class_group_schedules)와 개별 1회 예외(class_schedule_exceptions)는
//   어느 쪽도 수정하지 않는다. 휴강일 row 하나만 만들고 지운다.
// - 그 날짜에 이미 수업일지가 있으면 "학원 전체 휴강"과 모순이므로 저장을 막고 안내만 한다
//   (일지 자동 삭제/완료 처리는 절대 없음).
// - 보충수업/시험/숙제/할 일은 독립 record라 건드리지 않는다.
// - 실패 시 원본 DB 에러를 노출하지 않는다.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function revalidateScheduleSurfaces() {
  revalidatePath("/daily-logs", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/todos");
}

export async function setAcademyClosureAction(input: {
  date: string;
}): Promise<{ error: string } | { success: true }> {
  if (!DATE_PATTERN.test(input.date)) {
    return { error: "날짜를 선택해주세요." };
  }

  if (input.date < todayDateString()) {
    return { error: "지난 날짜는 휴강일로 등록할 수 없어요." };
  }

  // 그날 수업일지가 하나라도 있으면 "학원 전체 휴강"과 상태가 어긋난다 — 부분 적용 금지.
  const logs = await getDailyLogStatusesOnDate(input.date);
  if (logs.some((log) => log.status === "completed")) {
    return { error: "이미 완료된 수업일지가 있어 이 날짜 전체를 휴강 처리할 수 없어요." };
  }
  if (logs.length > 0) {
    return { error: "작성 중인 수업일지가 있어 휴강 등록 전에 먼저 확인해주세요." };
  }

  try {
    await upsertAcademyClosure(input.date);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "학원 휴강을 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidateScheduleSurfaces();
  return { success: true };
}

export async function removeAcademyClosureAction(input: {
  date: string;
}): Promise<{ error: string } | { success: true }> {
  if (!DATE_PATTERN.test(input.date)) {
    return { error: "날짜를 선택해주세요." };
  }

  // 해제하면 그 날짜 수업이 다시 살아나는데, 이미 일지가 있으면 동일한 안전 규칙을 적용한다
  const logs = await getDailyLogStatusesOnDate(input.date);
  if (logs.length > 0) {
    const label = formatShortDateWithWeekday(input.date);
    return {
      error: logs.some((log) => log.status === "completed")
        ? `${label}에 이미 완료된 수업일지가 있어 휴강을 해제할 수 없어요.`
        : `${label}에 작성 중인 수업일지가 있어요. 해제 전에 먼저 확인해주세요.`,
    };
  }

  try {
    await deleteAcademyClosure(input.date);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "학원 휴강을 해제하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidateScheduleSurfaces();
  return { success: true };
}
