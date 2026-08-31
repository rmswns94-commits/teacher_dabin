"use server";

import { revalidatePath } from "next/cache";

import { cancelMakeup, completeMakeup, scheduleMakeup } from "@/lib/supabase/queries/makeups";
import { makeupCompleteSchema, makeupScheduleSchema } from "@/lib/validation/daily-log";

function revalidateMakeupPages() {
  revalidatePath("/makeups");
  revalidatePath("/dashboard");
  revalidatePath("/daily-logs");
}

export async function scheduleMakeupAction(makeupId: string, formData: FormData) {
  const parsed = makeupScheduleSchema.safeParse({
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "보충 예정일을 확인해주세요.");
  }

  await scheduleMakeup(makeupId, parsed.data.scheduledDate);
  revalidateMakeupPages();
}

export async function completeMakeupAction(makeupId: string, formData: FormData) {
  const parsed = makeupCompleteSchema.safeParse({
    completedDate: String(formData.get("completedDate") ?? ""),
    completedProgress: String(formData.get("completedProgress") ?? ""),
    comment: String(formData.get("comment") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "보충 완료 정보를 확인해주세요.");
  }

  await completeMakeup(makeupId, {
    completedDate: parsed.data.completedDate,
    completedProgress: parsed.data.completedProgress,
    comment: parsed.data.comment,
  });
  revalidateMakeupPages();
}

export async function cancelMakeupAction(makeupId: string) {
  await cancelMakeup(makeupId);
  revalidateMakeupPages();
}
