"use server";

import { revalidatePath } from "next/cache";

import { reconcileExpiredExamModes } from "@/lib/supabase/queries/exam-mode-auto-off";

// AUTO EXAM MODE OFF — 클라이언트 lifecycle(앱 진입/화면 이동/PWA 복귀/KST 자정)이 부르는 reconciliation 액션.
// 실제 true→false 전환이 있을 때만 수동 OFF(setExamPeriodAction)와 같은 범위로 revalidate한다.
// polling 없음: 호출 시점은 components/exam-mode-reconciler가 결정한다.
export async function reconcileExamModesAction() {
  try {
    const result = await reconcileExpiredExamModes();
    if (result.turnedOff.length > 0) {
      revalidatePath("/groups");
      for (const group of result.turnedOff) {
        revalidatePath(`/groups/${group.id}`);
      }
      revalidatePath("/daily-logs");
      revalidatePath("/dashboard");
      revalidatePath("/", "layout");
    }
    return { success: true as const, checked: result.checked, turnedOff: result.turnedOff };
  } catch (error) {
    console.error("reconcileExamModesAction error", error instanceof Error ? error.message : error);
    return { success: false as const, checked: 0, turnedOff: [] as { id: string; name: string }[] };
  }
}
