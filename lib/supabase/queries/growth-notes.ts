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

// 기간 내 수업 기록을 한 번에 가져온다 (선택된 그룹 학생 batch — N+1 방지).
// studentIds를 주면 해당 학생들만 (목록: 반 학생 전체 / 상세: 학생 1명, bounded 기간).
export async function getGrowthLessonRows(
  startDate: string,
  endDate: string,
  studentIds?: string[],
) {
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

  if (studentIds) {
    if (studentIds.length === 0) {
      return [] as GrowthLessonRow[];
    }
    query = query.in("student_id", studentIds);
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

// 기간 이후 칭찬을 한 번에 가져온다 (선택 학생들 batch).
export async function getGrowthPraiseRows(sinceDate: string, studentIds?: string[]) {
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

  if (studentIds) {
    if (studentIds.length === 0) {
      return [] as GrowthPraiseRow[];
    }
    query = query.in("student_id", studentIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getGrowthPraiseRows error", error);
    return [] as GrowthPraiseRow[];
  }

  return (data ?? []) as GrowthPraiseRow[];
}

// 틈새왕 판정용: 주간에 걸치는 보충수업을 한 번에 가져온다 (학생별 개별 쿼리 금지).
// 주간 귀속/취소 제외 규칙은 lib/growth.ts의 scopeMakeupsToWeek/calculateMakeupStat이 처리.
export type GrowthMakeupRow = {
  student_id: string;
  status: "required" | "scheduled" | "completed" | "cancelled";
  scheduled_date: string | null;
  completed_date: string | null;
};

export async function getGrowthMakeupRows(
  weekStart: string,
  weekEnd: string,
  studentIds?: string[],
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as GrowthMakeupRow[];
  }

  let query = supabase
    .from("makeup_lessons")
    .select("student_id, status, scheduled_date, completed_date")
    .eq("user_id", user.id)
    .or(
      `and(scheduled_date.gte.${weekStart},scheduled_date.lte.${weekEnd}),and(completed_date.gte.${weekStart},completed_date.lte.${weekEnd})`,
    );

  if (studentIds) {
    if (studentIds.length === 0) {
      return [] as GrowthMakeupRow[];
    }
    query = query.in("student_id", studentIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getGrowthMakeupRows error", error);
    return [] as GrowthMakeupRow[];
  }

  return (data ?? []) as GrowthMakeupRow[];
}
