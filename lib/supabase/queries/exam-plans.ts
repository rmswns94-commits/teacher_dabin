import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ExamPrepPlanRecord } from "@/lib/supabase/types";

// 시험 대비 플래너 계획. 시험 하나의 계획 전체를 batch 1쿼리로 가져온다 —
// 계획 수는 시험당 수십 개 수준이라 월 전환은 client state만으로 즉시 처리(추가 fetch/race 없음).

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

const MIGRATION_MESSAGE =
  "시험 대비 플래너의 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260907_create_exam_prep_plans.sql을 실행한 뒤 다시 시도해주세요.";

function throwPlanError(error: { code?: string } | null, fallback: string): never {
  throw new Error(MISSING_TABLE_CODES.has(error?.code ?? "") ? MIGRATION_MESSAGE : fallback);
}

export async function getExamPrepPlans(examId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ExamPrepPlanRecord[];
  }

  const { data, error } = await supabase
    .from("exam_prep_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("school_exam_id", examId)
    .order("plan_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    // migration 미적용 등 실패 시에도 시험 상세는 떠야 한다 — 플래너만 빈 상태
    console.error("getExamPrepPlans error", { code: error.code, message: error.message });
    return [] as ExamPrepPlanRecord[];
  }

  return (data ?? []) as ExamPrepPlanRecord[];
}

export async function createExamPrepPlan(input: {
  examId: string;
  planDate: string;
  unitLabel: string | null;
  title: string;
  memo: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: exam } = await supabase
    .from("school_exam_details")
    .select("id")
    .eq("id", input.examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exam) {
    throw new Error("시험 정보를 찾을 수 없어요.");
  }

  const { data, error } = await supabase
    .from("exam_prep_plans")
    .insert({
      user_id: user.id,
      school_exam_id: input.examId,
      plan_date: input.planDate,
      unit_label: input.unitLabel?.trim() || null,
      title: input.title.trim(),
      memo: input.memo?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("createExamPrepPlan error", error);
    throwPlanError(error, "계획을 추가하지 못했어요. 다시 시도해주세요.");
  }

  return data as ExamPrepPlanRecord;
}

export async function updateExamPrepPlan(
  planId: string,
  input: { planDate: string; unitLabel: string | null; title: string; memo: string | null },
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("exam_prep_plans")
    .update({
      plan_date: input.planDate,
      unit_label: input.unitLabel?.trim() || null,
      title: input.title.trim(),
      memo: input.memo?.trim() || null,
    })
    .eq("id", planId)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("updateExamPrepPlan error", error);
    throwPlanError(error, "계획을 수정하지 못했어요. 다시 시도해주세요.");
  }

  return data as ExamPrepPlanRecord;
}

// 완료 toggle은 절대값 set — 더블탭이 겹쳐도 마지막 상태로 수렴한다 (멱등)
export async function setExamPrepPlanCompleted(planId: string, completed: boolean) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("exam_prep_plans")
    .update({ completed })
    .eq("id", planId)
    .eq("user_id", user.id);

  if (error) {
    console.error("setExamPrepPlanCompleted error", error);
    throwPlanError(error, "완료 상태를 바꾸지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

export async function deleteExamPrepPlan(planId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("exam_prep_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteExamPrepPlan error", error);
    throwPlanError(error, "계획을 삭제하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}
