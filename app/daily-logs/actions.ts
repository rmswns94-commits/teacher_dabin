"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteDailyLog,
  DuplicateDailyLogError,
  saveDailyLog,
} from "@/lib/supabase/queries/daily-logs";
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
    // 중복은 일반 오류가 아니라 전용 경고 dialog로 안내한다 (form 내용은 보존)
    if (error instanceof DuplicateDailyLogError) {
      return { error: error.message, duplicate: true as const };
    }

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
  // 관찰값(질문/배려/노력 등) 변경이 성장노트 주간 판정에 바로 반영되게 한다
  revalidatePath("/growth-notes", "layout");
  redirect(`/daily-logs/${dailyLogId}?saved=1`);
}

// 수업일지 삭제 (destructive — client에서 확인 dialog를 거친 뒤 호출).
// 성공 시 class_date를 돌려줘 삭제 후에도 같은 날짜 목록으로 돌아갈 수 있게 한다.
export async function deleteDailyLogAction(dailyLogId: string) {
  let classDate: string;

  try {
    classDate = await deleteDailyLog(dailyLogId);
  } catch (error) {
    console.error("deleteDailyLogAction error", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "수업일지를 삭제하지 못했어요. 다시 시도해주세요.",
    };
  }

  revalidatePath("/daily-logs");
  revalidatePath("/makeups");
  revalidatePath("/dashboard");
  revalidatePath("/students");
  revalidatePath("/groups");
  // 삭제된 출결/평가/칭찬이 성장노트 주간 판정·칭찬 요약에 stale하게 남지 않게
  revalidatePath("/growth-notes", "layout");

  return { success: true as const, classDate };
}
