"use server";

import { revalidatePath } from "next/cache";

import { cancelMakeup, completeMakeup, scheduleMakeup } from "@/lib/supabase/queries/makeups";
import { makeupCompleteSchema, makeupScheduleSchema } from "@/lib/validation/daily-log";

type ActionResult = { error: string } | { success: true };

function revalidateMakeupPages() {
  revalidatePath("/makeups");
  revalidatePath("/dashboard");
  revalidatePath("/daily-logs");
  revalidatePath("/students");
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function scheduleMakeupAction(
  makeupId: string,
  values: { scheduledDate: string; startTime: string; endTime: string; memo: string },
): Promise<ActionResult> {
  const parsed = makeupScheduleSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "보충 일정을 확인해주세요." };
  }

  try {
    await scheduleMakeup(makeupId, {
      scheduledDate: parsed.data.scheduledDate,
      startTime: parsed.data.startTime || null,
      endTime: parsed.data.endTime || null,
      memo: parsed.data.memo || null,
    });
  } catch (error) {
    return { error: messageOf(error, "보충 일정을 저장하지 못했어요.") };
  }

  revalidateMakeupPages();
  return { success: true };
}

export async function completeMakeupAction(
  makeupId: string,
  values: { completedDate: string; completedProgress: string; comment: string },
): Promise<ActionResult> {
  const parsed = makeupCompleteSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "보충 완료 정보를 확인해주세요." };
  }

  try {
    await completeMakeup(makeupId, {
      completedDate: parsed.data.completedDate,
      completedProgress: parsed.data.completedProgress,
      comment: parsed.data.comment,
    });
  } catch (error) {
    return { error: messageOf(error, "보충수업을 완료 처리하지 못했어요.") };
  }

  revalidateMakeupPages();
  return { success: true };
}

export async function cancelMakeupAction(makeupId: string): Promise<ActionResult> {
  try {
    await cancelMakeup(makeupId);
  } catch (error) {
    return { error: messageOf(error, "보충수업을 취소하지 못했어요.") };
  }

  revalidateMakeupPages();
  return { success: true };
}
