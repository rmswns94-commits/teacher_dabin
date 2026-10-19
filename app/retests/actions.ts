"use server";

import { revalidatePath } from "next/cache";

import { validateScorePair } from "@/lib/assessments";
import type { RetestAttempt } from "@/lib/retests";
import { passRetest, recordRetestFailure } from "@/lib/supabase/queries/retests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const messageOf = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "재시험 결과를 저장하지 못했어요.";

// 재시험 [통과]. 원래 시험 점수와 미통과 시도 이력은 그대로 두고 재시험 상태만 통과로 바꾼다.
// 반 상세는 화면이 낙관적으로 이미 반영했으므로 메인(반 카드 count)만 다시 그리게 한다.
export async function passRetestAction(retestId: string): Promise<{ error: string } | { success: true }> {
  if (!UUID.test(retestId)) {
    return { error: "잘못된 요청이에요." };
  }
  try {
    await passRetest(retestId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath("/retests");
  return { success: true };
}

// 재시험 [미통과 저장] — 이번 재시험 점수(맞은 개수/총 문항)가 필수다.
// 같은 규칙(validateScorePair)으로 서버에서도 다시 검증하고, 시도 추가 + 미통과 처리는 DB 함수 한 번(원자적).
export async function failRetestAction(input: {
  retestId: string;
  correctCount: string;
  totalQuestions: string;
  requestId: string;
}): Promise<{ error: string } | { success: true; attempt: RetestAttempt }> {
  if (!UUID.test(input.retestId) || !UUID.test(input.requestId)) {
    return { error: "잘못된 요청이에요." };
  }
  const score = validateScorePair(input.correctCount, input.totalQuestions);
  if (!score.ok) {
    return { error: score.message };
  }
  try {
    const attempt = await recordRetestFailure({
      retestId: input.retestId,
      correctCount: score.correct,
      totalQuestions: score.total,
      requestId: input.requestId,
    });
    revalidatePath("/retests");
    return { success: true, attempt };
  } catch (error) {
    return { error: messageOf(error) };
  }
}
