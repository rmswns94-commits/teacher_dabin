import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ExamPrepPlanRecord } from "@/lib/supabase/types";

// 시험 대비 플래너 계획. 시험 하나의 계획 전체를 batch 1쿼리로 가져온다 —
// 계획 수는 시험당 수십 개 수준이라 월 전환은 client state만으로 즉시 처리(추가 fetch/race 없음).
// 참고: unit_label/memo 컬럼은 UI 단순화(할 내용 중심) 이후에도 legacy 데이터 보존을 위해
// DB에 유지된다 — 신규 저장은 null, 수정도 두 컬럼을 건드리지 않는다 (DROP 금지).

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

const MIGRATION_MESSAGE =
  "시험 대비 플래너의 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260907_create_exam_prep_plans.sql을 실행한 뒤 다시 시도해주세요.";

// dev overlay에서 {}로 뭉개지지 않게 문자열로 구조화해 남긴다 (실제 코드/메시지가 바로 보이게)
function logPlanError(where: string, error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null) {
  console.error(
    `${where}: code=${error?.code ?? "?"} message=${error?.message ?? "?"} details=${error?.details ?? "-"} hint=${error?.hint ?? "-"}`,
  );
}

function throwPlanError(error: { code?: string } | null, fallback: string): never {
  throw new Error(MISSING_TABLE_CODES.has(error?.code ?? "") ? MIGRATION_MESSAGE : fallback);
}

export type ExamPlanCounts = { total: number; done: number };

// 시험 목록 카드의 진행률용: 여러 시험의 계획 완료/전체 개수를 1쿼리 batch (카드별 반복 쿼리 금지).
// 최소 필드(school_exam_id, completed)만 조회한다. 실패/미적용 시 빈 Map — 목록은 항상 뜬다.
export async function getExamPlanCountsByExamIds(examIds: string[]) {
  const counts = new Map<string, ExamPlanCounts>();
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || examIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabase
    .from("exam_prep_plans")
    .select("school_exam_id, completed")
    .eq("user_id", user.id)
    .in("school_exam_id", examIds);

  if (error) {
    if (!MISSING_TABLE_CODES.has(error.code ?? "")) {
      logPlanError("getExamPlanCountsByExamIds", error);
    }
    return counts;
  }

  for (const row of (data ?? []) as { school_exam_id: string; completed: boolean }[]) {
    const entry = counts.get(row.school_exam_id) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (row.completed) {
      entry.done += 1;
    }
    counts.set(row.school_exam_id, entry);
  }

  return counts;
}

// 계획 0개는 정상(empty)이고 error가 아니다. 진짜 쿼리 실패만 failed로 구분해
// UI가 empty 상태로 위장하지 않고 안내를 보여줄 수 있게 한다.
export async function getExamPrepPlans(
  examId: string,
): Promise<{ rows: ExamPrepPlanRecord[]; failed: boolean }> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [], failed: false };
  }

  const { data, error } = await supabase
    .from("exam_prep_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("school_exam_id", examId)
    .order("plan_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    // 시험 상세 자체는 떠야 한다 — 플래너만 error 상태로 표시
    logPlanError("getExamPrepPlans error", error);
    return { rows: [], failed: true };
  }

  return { rows: (data ?? []) as ExamPrepPlanRecord[], failed: false };
}

export async function createExamPrepPlan(input: {
  examId: string;
  planDate: string;
  title: string;
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
      title: input.title.trim(),
    })
    .select("*")
    .single();

  if (error || !data) {
    logPlanError("createExamPrepPlan error", error);
    throwPlanError(error, "계획을 추가하지 못했어요. 다시 시도해주세요.");
  }

  return data as ExamPrepPlanRecord;
}

// 수정은 날짜/할 내용만. completed는 checkbox로만 바뀌고,
// legacy unit_label/memo 값은 수정 저장이 건드리지 않는다 (자동 NULL 처리 금지).
export async function updateExamPrepPlan(
  planId: string,
  input: { planDate: string; title: string },
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
      title: input.title.trim(),
    })
    .eq("id", planId)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    logPlanError("updateExamPrepPlan error", error);
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
    logPlanError("setExamPrepPlanCompleted error", error);
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
    logPlanError("deleteExamPrepPlan error", error);
    throwPlanError(error, "계획을 삭제하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}
