"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveDailyLog } from "@/lib/supabase/queries/daily-logs";
import { dailyLogSchema, type DailyLogFormInput } from "@/lib/validation/daily-log";

export async function saveDailyLogAction(input: DailyLogFormInput) {
  const parsed = dailyLogSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  let dailyLogId: string | null = null;

  try {
    dailyLogId = await saveDailyLog(parsed.data);
  } catch (error) {
    console.error("saveDailyLogAction error", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "수업 기록을 저장하지 못했어요. 다시 시도해주세요.",
    };
  }

  revalidatePath("/daily-logs");
  revalidatePath(`/daily-logs/${dailyLogId}`);
  revalidatePath("/makeups");
  revalidatePath("/dashboard");
  redirect(`/daily-logs/${dailyLogId}?saved=1`);
}
