import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ConsultationMethod, ConsultationTarget } from "@/lib/validation/consultation";

// 학생 상담 기록 조회·저장.
// - 조회는 항상 학생 1명 기준이다 (학생 목록에서 전체 학생 상담을 미리 읽지 않는다).
// - 학원 격리와 소유 확인은 RLS가 강제한다 — 여기서는 user_id/student_id만 명시한다.
// - 상담 내용은 민감할 수 있어 로그에 본문을 남기지 않는다 (오류 코드만 기록).

// migration 미적용(테이블 없음)은 오류가 아니라 "상담 기록 기능이 아직 꺼진 상태"다 —
// 읽기 경로에서는 조용히 빈 목록으로 두고, 저장 경로에서만 사용자에게 알린다.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

export const CONSULTATION_MIGRATION_MESSAGE =
  "상담 기록에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260923_create_student_consultations.sql을 실행한 뒤 다시 시도해주세요.";

export type ConsultationRecord = {
  id: string;
  student_id: string;
  consultation_date: string;
  consultation_time: string | null;
  target: ConsultationTarget;
  method: ConsultationMethod;
  summary: string;
  content: string;
  follow_up_note: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, student_id, consultation_date, consultation_time, target, method, summary, content, follow_up_note, created_at, updated_at";

// 이 학생의 상담 기록 (최신순). limit을 주면 그만큼만 — 목록은 더 보기로 늘린다.
// sinceDate를 주면 그 날짜 이후만 (타임라인의 기간 필터용).
export async function getStudentConsultations(
  studentId: string,
  options?: { limit?: number; sinceDate?: string | null },
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ConsultationRecord[];
  }

  let query = supabase
    .from("student_consultations")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .order("consultation_date", { ascending: false })
    .order("consultation_time", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  if (options?.sinceDate) {
    query = query.gte("consultation_date", options.sinceDate);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getStudentConsultations error", { code: error.code, message: error.message });
    }
    return [] as ConsultationRecord[];
  }

  return (data ?? []) as ConsultationRecord[];
}

// 수정/삭제 직전 소유 확인용 point lookup.
export async function getConsultationById(consultationId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("student_consultations")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("id", consultationId)
    .maybeSingle();

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getConsultationById error", { code: error.code, message: error.message });
    }
    return null;
  }

  return (data as ConsultationRecord | null) ?? null;
}

export type ConsultationInput = {
  studentId: string;
  consultationDate: string;
  consultationTime: string | null;
  target: ConsultationTarget;
  method: ConsultationMethod;
  summary: string;
  content: string;
  followUpNote: string | null;
};

export async function createConsultation(input: ConsultationInput) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("student_consultations")
    .insert({
      user_id: user.id,
      student_id: input.studentId,
      consultation_date: input.consultationDate,
      consultation_time: input.consultationTime,
      target: input.target,
      method: input.method,
      summary: input.summary,
      content: input.content,
      follow_up_note: input.followUpNote,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createConsultation error", { code: error.code, message: error.message });
    if (isMissingTable(error)) {
      throw new Error(CONSULTATION_MIGRATION_MESSAGE);
    }
    throw new Error("상담 기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return (data as { id: string }).id;
}

// 수정 — 학생/학원/소유자는 바꾸지 않는다 (상담 내용만 갱신).
export async function updateConsultation(
  consultationId: string,
  input: Omit<ConsultationInput, "studentId">,
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_consultations")
    .update({
      consultation_date: input.consultationDate,
      consultation_time: input.consultationTime,
      target: input.target,
      method: input.method,
      summary: input.summary,
      content: input.content,
      follow_up_note: input.followUpNote,
    })
    .eq("id", consultationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateConsultation error", { code: error.code, message: error.message });
    if (isMissingTable(error)) {
      throw new Error(CONSULTATION_MIGRATION_MESSAGE);
    }
    throw new Error("상담 기록을 수정하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return true;
}

export async function deleteConsultation(consultationId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("student_consultations")
    .delete()
    .eq("id", consultationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteConsultation error", { code: error.code, message: error.message });
    throw new Error("상담 기록을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return true;
}
