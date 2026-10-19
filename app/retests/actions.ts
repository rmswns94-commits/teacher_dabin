"use server";

import { revalidatePath } from "next/cache";

import { setRetestResult } from "@/lib/supabase/queries/retests";

type ActionResult = { error: string } | { success: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 재시험 [통과] / [미통과]. 원래 시험 점수는 바꾸지 않고 재시험 상태만 바꾼다.
// 반 상세는 화면이 낙관적으로 이미 반영했으므로 메인(반 카드 count)만 다시 그리게 한다.
export async function setRetestResultAction(retestId: string, result: "passed" | "failed"): Promise<ActionResult> {
  if (!UUID.test(retestId) || (result !== "passed" && result !== "failed")) {
    return { error: "잘못된 요청이에요." };
  }

  try {
    await setRetestResult(retestId, result);
  } catch (error) {
    return { error: error instanceof Error && error.message ? error.message : "재시험 결과를 저장하지 못했어요." };
  }

  revalidatePath("/retests");
  return { success: true };
}
