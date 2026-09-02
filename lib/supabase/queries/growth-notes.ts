import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  AttendanceStatus,
  EffortLevel,
  FocusLevel,
  HomeworkStatus,
  KindnessLevel,
  ParticipationLevel,
  PraiseCategory,
  QuestionLevel,
} from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// 성장노트 계산에 필요한 최소 필드만 담는 row.
// Teacher private 필드(memo, improvements, parent_note 등)는 select 자체에서 제외한다.
export type GrowthLessonRow = {
  student_id: string;
  daily_log_id: string;
  class_date: string;
  attendance: AttendanceStatus;
  homework_status: HomeworkStatus | null;
  vocab_correct: number | null;
  vocab_total: number | null;
  vocab_retest: boolean;
  focus_level: FocusLevel | null;
  participation_level: ParticipationLevel | null;
  question_level: QuestionLevel | null;
  kindness_level: KindnessLevel | null;
  effort_level: EffortLevel | null;
  strengths: string | null;
};

// 기간 내 수업 기록을 한 번에 가져온다 (전체 학생 batch — N+1 방지).
// studentId를 주면 해당 학생만 (상세용, bounded 기간).
export async function getGrowthLessonRows(startDate: string, endDate: string, studentId?: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as GrowthLessonRow[];
  }

  let query = supabase
    .from("student_lesson_logs")
    .select(
      "student_id, daily_log_id, attendance, homework_status, vocab_correct, vocab_retest, focus_level, participation_level, question_level, kindness_level, effort_level, strengths, daily_logs!inner(class_date, vocab_total)",
    )
    .eq("user_id", user.id)
    .gte("daily_logs.class_date", startDate)
    .lte("daily_logs.class_date", endDate);

  if (studentId) {
    query = query.eq("student_id", studentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getGrowthLessonRows error", error);
    return [] as GrowthLessonRow[];
  }

  return (data ?? [])
    .map((row) => {
      const dailyLog = pickOne<{ class_date: string; vocab_total: number | null }>(row.daily_logs);

      return {
        student_id: row.student_id,
        daily_log_id: row.daily_log_id,
        class_date: dailyLog?.class_date ?? "",
        attendance: row.attendance,
        homework_status: row.homework_status ?? null,
        vocab_correct: row.vocab_correct ?? null,
        vocab_total: dailyLog?.vocab_total ?? null,
        vocab_retest: Boolean(row.vocab_retest),
        focus_level: row.focus_level ?? null,
        participation_level: row.participation_level ?? null,
        question_level: row.question_level ?? null,
        kindness_level: row.kindness_level ?? null,
        effort_level: row.effort_level ?? null,
        strengths: row.strengths ?? null,
      } as GrowthLessonRow;
    })
    .sort((a, b) => a.class_date.localeCompare(b.class_date));
}

export type GrowthPraiseRow = {
  student_id: string;
  daily_log_id: string | null;
  category: PraiseCategory;
  comment: string | null;
  created_at: string;
};

// 기간 이후 칭찬을 한 번에 가져온다 (전체 학생 batch).
export async function getGrowthPraiseRows(sinceDate: string, studentId?: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as GrowthPraiseRow[];
  }

  let query = supabase
    .from("student_praises")
    .select("student_id, daily_log_id, category, comment, created_at")
    .eq("user_id", user.id)
    .gte("created_at", `${sinceDate}T00:00:00+09:00`);

  if (studentId) {
    query = query.eq("student_id", studentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getGrowthPraiseRows error", error);
    return [] as GrowthPraiseRow[];
  }

  return (data ?? []) as GrowthPraiseRow[];
}
