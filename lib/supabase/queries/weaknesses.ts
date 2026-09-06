import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { StudentRecord, StudentWeaknessRecord, WeaknessCategory } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// student_weaknesses 테이블 자체가 없음 = 대기 중인 migration 미적용
// (42P01: undefined table, PGRST205: PostgREST schema cache에 테이블 없음).
// "다시 시도"로 해결되지 않으므로 원인을 그대로 알려준다.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function missingTableMessage(error: { code?: string } | null | undefined) {
  return error?.code && MISSING_TABLE_CODES.has(error.code)
    ? "약점 노트 기능의 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260906_create_student_weaknesses.sql을 실행한 뒤 다시 시도해주세요."
    : null;
}

// 학생 상세용: 해당 학생의 약점 전체(active + resolved)를 쿼리 1번으로 조회.
// migration 미적용 등 조회 실패 시 빈 배열 — 학생 상세는 항상 떠야 한다.
export async function getStudentWeaknessesForCurrentUser(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as StudentWeaknessRecord[];
  }

  const { data, error } = await supabase
    .from("student_weaknesses")
    .select("*")
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getStudentWeaknessesForCurrentUser error", {
      code: error.code,
      message: error.message,
    });
    return [] as StudentWeaknessRecord[];
  }

  return (data ?? []) as StudentWeaknessRecord[];
}

export type ReviewQueueItem = StudentWeaknessRecord & {
  student: Pick<StudentRecord, "id" | "name"> | null;
};

// Dashboard 복습 큐: active + review_due_date <= today(KST)인 항목만 batch 1쿼리.
// 학생별 반복 쿼리 금지 — students embed로 이름까지 한 번에 받는다.
export async function getDueWeaknessesForCurrentUser(today: string, limit = 8) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ReviewQueueItem[];
  }

  const { data, error } = await supabase
    .from("student_weaknesses")
    .select("*, students(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .lte("review_due_date", today)
    .order("review_due_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("getDueWeaknessesForCurrentUser error", {
      code: error.code,
      message: error.message,
    });
    return [] as ReviewQueueItem[];
  }

  return (data ?? []).map((row) => ({
    ...(row as unknown as StudentWeaknessRecord),
    student: pickOne<Pick<StudentRecord, "id" | "name">>(row.students),
  }));
}

export async function createStudentWeakness(input: {
  studentId: string;
  groupId?: string | null;
  sourceDailyLogId?: string | null;
  category: WeaknessCategory;
  title: string;
  note?: string | null;
  reviewDueDate?: string | null;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", input.studentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없어요.");
  }

  const { error } = await supabase.from("student_weaknesses").insert({
    user_id: user.id,
    student_id: input.studentId,
    group_id: input.groupId || null,
    source_daily_log_id: input.sourceDailyLogId || null,
    category: input.category,
    title: input.title.trim(),
    note: input.note?.trim() || null,
    review_due_date: input.reviewDueDate || null,
    status: "active",
  });

  if (error) {
    console.error("createStudentWeakness error", { code: error.code, message: error.message });
    throw new Error(missingTableMessage(error) ?? "약점을 기록하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// 분류/내용/메모/다시 확인 날짜 수정. "다시 확인" (due 날짜만 재지정)도 이 경로를 쓴다.
export async function updateStudentWeakness(
  weaknessId: string,
  input: {
    category: WeaknessCategory;
    title: string;
    note?: string | null;
    reviewDueDate?: string | null;
  },
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_weaknesses")
    .update({
      category: input.category,
      title: input.title.trim(),
      note: input.note?.trim() || null,
      review_due_date: input.reviewDueDate || null,
    })
    .eq("id", weaknessId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateStudentWeakness error", { code: error.code, message: error.message });
    throw new Error("약점 기록을 수정하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// 확인 완료: 삭제하지 않고 resolved로만 전환한다 (이력 보존).
export async function resolveStudentWeakness(weaknessId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_weaknesses")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", weaknessId)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    console.error("resolveStudentWeakness error", { code: error.code, message: error.message });
    throw new Error("확인 완료 처리를 하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// 해결된 약점을 다시 active로 (다시 봤는데 아직 부족한 경우).
export async function reopenStudentWeakness(weaknessId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_weaknesses")
    .update({ status: "active", resolved_at: null })
    .eq("id", weaknessId)
    .eq("user_id", user.id)
    .eq("status", "resolved");

  if (error) {
    console.error("reopenStudentWeakness error", { code: error.code, message: error.message });
    throw new Error("약점 기록을 다시 열지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

// 실수 등록 정리용 완전 삭제 (client에서 확인 dialog를 거친 뒤 호출).
export async function deleteStudentWeakness(weaknessId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_weaknesses")
    .delete()
    .eq("id", weaknessId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteStudentWeakness error", { code: error.code, message: error.message });
    throw new Error("약점 기록을 삭제하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}
