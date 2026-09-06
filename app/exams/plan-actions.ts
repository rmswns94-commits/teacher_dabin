"use server";

import {
  createExamPrepPlan,
  deleteExamPrepPlan,
  setExamPrepPlanCompleted,
  updateExamPrepPlan,
} from "@/lib/supabase/queries/exam-plans";
import { examPlanSchema } from "@/lib/validation/exam-plan";
import type { ExamPrepPlanRecord } from "@/lib/supabase/types";

// 플래너 mutation은 전부 client가 local state로 즉시 반영한다(optimistic) —
// revalidatePath/router.refresh 없음 (checkbox 하나에 Calendar 전체 재로드 금지).
// 상세 페이지는 dynamic이라 다음 방문 때 자연스럽게 DB 최신값을 읽는다.

type PlanResult = { error: string } | { success: true; plan: ExamPrepPlanRecord };

export async function createExamPlanAction(
  examId: string,
  values: { planDate: string; unitLabel: string; title: string; memo: string },
): Promise<PlanResult> {
  const parsed = examPlanSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  try {
    const plan = await createExamPrepPlan({
      examId,
      planDate: parsed.data.planDate,
      unitLabel: parsed.data.unitLabel || null,
      title: parsed.data.title,
      memo: parsed.data.memo || null,
    });
    return { success: true, plan };
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "계획을 추가하지 못했어요.",
    };
  }
}

export async function updateExamPlanAction(
  planId: string,
  values: { planDate: string; unitLabel: string; title: string; memo: string },
): Promise<PlanResult> {
  const parsed = examPlanSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  try {
    const plan = await updateExamPrepPlan(planId, {
      planDate: parsed.data.planDate,
      unitLabel: parsed.data.unitLabel || null,
      title: parsed.data.title,
      memo: parsed.data.memo || null,
    });
    return { success: true, plan };
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "계획을 수정하지 못했어요.",
    };
  }
}

// 절대값 set (멱등) — 빠른 연속 탭이 겹쳐도 마지막 탭 상태로 수렴
export async function setExamPlanCompletedAction(
  planId: string,
  completed: boolean,
): Promise<{ error: string } | { success: true }> {
  try {
    await setExamPrepPlanCompleted(planId, Boolean(completed));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message ? error.message : "완료 상태를 바꾸지 못했어요.",
    };
  }
}

export async function deleteExamPlanAction(
  planId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteExamPrepPlan(planId);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "계획을 삭제하지 못했어요.",
    };
  }
}
