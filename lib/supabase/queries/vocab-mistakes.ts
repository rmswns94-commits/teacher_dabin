import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 일지 수정 화면 복원용: 이 일지의 오답 전체 (쿼리 1번, 입력 순서 유지).
// migration 미적용 등 조회 실패 시 빈 배열 — 수정 화면은 항상 떠야 한다.
export type DailyLogVocabMistakeRow = { student_id: string; word: string };

export async function getVocabMistakesForDailyLog(dailyLogId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as DailyLogVocabMistakeRow[];
  }

  const { data, error } = await supabase
    .from("vocab_mistakes")
    .select("student_id, word")
    .eq("user_id", user.id)
    .eq("daily_log_id", dailyLogId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getVocabMistakesForDailyLog error", {
      code: error.code,
      message: error.message,
    });
    return [] as DailyLogVocabMistakeRow[];
  }

  return (data ?? []) as DailyLogVocabMistakeRow[];
}

// 학생 상세용: 학생의 오답 occurrence를 기간 제한으로 batch 1쿼리 (N+1 금지).
export type StudentVocabMistakeRow = { daily_log_id: string; word: string; created_at: string };

export async function getStudentVocabMistakes(studentId: string, sinceIso: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as StudentVocabMistakeRow[];
  }

  const { data, error } = await supabase
    .from("vocab_mistakes")
    .select("daily_log_id, word, created_at")
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getStudentVocabMistakes error", { code: error.code, message: error.message });
    return [] as StudentVocabMistakeRow[];
  }

  return (data ?? []) as StudentVocabMistakeRow[];
}
