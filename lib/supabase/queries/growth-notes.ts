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
  // 온라인 복습 (null=미평가 — 복습왕/꾸준왕/도약왕에서 분모 제외)
  online_review_completed: boolean | null;
  // 문법/독해 시험 (lib/assessments jsonb — migration 전에는 null)
  assessment_results: unknown;
  assessment_totals: unknown;
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

  if (studentIds && studentIds.length === 0) {
    return [] as GrowthLessonRow[];
  }
  // 문법/독해 시험 컬럼(20261010 migration)이 없으면 단어시험만으로 재조회 — 성장노트가 migration 전에도 그대로 동작
  const run = (withAssessments: boolean) => {
    let query = supabase
      .from("student_lesson_logs")
      .select(
        withAssessments
          ? "student_id, daily_log_id, attendance, homework_status, vocab_correct, vocab_retest, focus_level, participation_level, question_level, kindness_level, effort_level, strengths, online_review_completed, assessment_results, daily_logs!inner(class_date, vocab_total, assessment_totals)"
          : "student_id, daily_log_id, attendance, homework_status, vocab_correct, vocab_retest, focus_level, participation_level, question_level, kindness_level, effort_level, strengths, online_review_completed, daily_logs!inner(class_date, vocab_total)",
      )
      .eq("user_id", user.id)
      .gte("daily_logs.class_date", startDate)
      .lte("daily_logs.class_date", endDate);
    if (studentIds) {
      query = query.in("student_id", studentIds);
    }
    return query;
  };

  let { data, error } = await run(true);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, error } = await run(false));
  }

  if (error) {
    console.error("getGrowthLessonRows error", error);
    return [] as GrowthLessonRow[];
  }

  // select 문자열이 조건부라 타입 추론 대신 필요한 필드만 명시한 raw row로 읽는다
  type RawGrowthRow = Omit<GrowthLessonRow, "class_date" | "vocab_total" | "assessment_totals"> & { daily_logs: unknown };
  return ((data ?? []) as unknown as RawGrowthRow[])
    .map((row) => {
      const dailyLog = pickOne<{ class_date: string; vocab_total: number | null; assessment_totals?: unknown }>(row.daily_logs);

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
        online_review_completed: (row.online_review_completed ?? null) as boolean | null,
        assessment_results: (row as { assessment_results?: unknown }).assessment_results ?? null,
        assessment_totals: dailyLog?.assessment_totals ?? null,
      } as GrowthLessonRow;
    })
    .sort((a, b) => a.class_date.localeCompare(b.class_date));
}

// 새 왕(숙제왕/꾸준왕/과제꾸준왕/도약왕)용 숙제 — 마감일(due_date) 범위 batch 1쿼리.
// 대상 판정 재료를 함께 싣는다: 개인/다중 배정은 assigned_student_id, 공통(null)은 그 수업 일지에
// 기록이 있는 학생들(student_lesson_logs) — 현재 반 소속으로 과거 공통 숙제를 재계산하지 않는다
// (student-timeline의 공통 숙제 규칙과 동일). 학생별/날짜별 개별 쿼리 없음.
export type GrowthHomeworkRow = {
  id: string;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
  assigned_student_id: string | null;
  daily_log_id: string;
  class_date: string;
  attendee_student_ids: string[];
};

export async function getGrowthHomeworkRows(
  startDate: string,
  endDate: string,
  studentIds: string[],
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || studentIds.length === 0) {
    return [] as GrowthHomeworkRow[];
  }

  const { data, error } = await supabase
    .from("daily_log_homework_assignments")
    .select(
      "id, due_date, completed, completed_at, assigned_student_id, daily_log:daily_logs!inner(id, class_date, student_lesson_logs(student_id))",
    )
    .eq("user_id", user.id)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .or(`assigned_student_id.is.null,assigned_student_id.in.(${studentIds.join(",")})`);

  if (error) {
    // migration 미적용 등 — 숙제 기반 왕만 "기록 없음"으로 degrade (다른 왕/배지는 그대로)
    console.error("getGrowthHomeworkRows error", { code: error.code, message: error.message });
    return [] as GrowthHomeworkRow[];
  }

  return (data ?? []).flatMap((row) => {
    const log = pickOne<{ id: string; class_date: string; student_lesson_logs: { student_id: string }[] | null }>(row.daily_log);
    if (!log) {
      return [];
    }
    return [
      {
        id: row.id as string,
        due_date: row.due_date as string,
        completed: Boolean(row.completed),
        completed_at: (row.completed_at ?? null) as string | null,
        assigned_student_id: (row.assigned_student_id ?? null) as string | null,
        daily_log_id: log.id,
        class_date: log.class_date,
        attendee_student_ids: (log.student_lesson_logs ?? []).map((item) => item.student_id),
      },
    ];
  });
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

// 완료(Final Save)된 수업일지의 시험 결과 — 단어 연속 만점(누적)·단어왕 통과율·월말평가 등수용.
// - 학생 id 묶음으로 한 번에 (학생별 쿼리 없음). 반을 옮긴 학생도 student_id 기준이라 이전 반 기록이 이어진다.
// - 임시저장(draft) 일지는 제외 — 확정된 결과만. 학원 격리는 student_lesson_logs RLS가 강제한다.
// - 누적 집계라 endDate 이전 전체를 읽는다: 필요한 컬럼만, 1000행 단위 page로 끝까지 (PostgREST 기본 상한 대비).
export type AssessmentHistoryRow = {
  student_id: string;
  daily_log_id: string;
  attendance: AttendanceStatus;
  class_date: string;
  log_created_at: string | null;
  vocab_correct: number | null;
  vocab_retest: boolean;
  vocab_total: number | null;
  assessment_results: unknown;
  assessment_totals: unknown;
};

const HISTORY_PAGE_SIZE = 1000;

export async function getCompletedAssessmentHistory(studentIds: readonly string[], endDate: string, startDate?: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || studentIds.length === 0) {
    return [] as AssessmentHistoryRow[];
  }

  const rows: AssessmentHistoryRow[] = [];
  for (let from = 0; ; from += HISTORY_PAGE_SIZE) {
    let query = supabase
      .from("student_lesson_logs")
      .select(
        "id, student_id, daily_log_id, attendance, vocab_correct, vocab_retest, assessment_results, daily_logs!inner(class_date, status, created_at, vocab_total, assessment_totals)",
      )
      .eq("user_id", user.id)
      .in("student_id", [...studentIds])
      .eq("daily_logs.status", "completed")
      .lte("daily_logs.class_date", endDate)
      .order("id", { ascending: true })
      .range(from, from + HISTORY_PAGE_SIZE - 1);
    if (startDate) {
      query = query.gte("daily_logs.class_date", startDate);
    }
    const { data, error } = await query;
    if (error) {
      console.error("getCompletedAssessmentHistory error", { code: error.code, message: error.message });
      return rows;
    }
    type Raw = {
      student_id: string;
      daily_log_id: string;
      attendance: AttendanceStatus;
      vocab_correct: number | null;
      vocab_retest: boolean | null;
      assessment_results?: unknown;
      daily_logs: unknown;
    };
    for (const row of (data ?? []) as unknown as Raw[]) {
      const log = pickOne<{ class_date: string; created_at: string | null; vocab_total: number | null; assessment_totals?: unknown }>(row.daily_logs);
      if (!log) {
        continue;
      }
      rows.push({
        student_id: row.student_id,
        daily_log_id: row.daily_log_id,
        attendance: row.attendance,
        class_date: log.class_date,
        log_created_at: log.created_at ?? null,
        vocab_correct: row.vocab_correct ?? null,
        vocab_retest: Boolean(row.vocab_retest),
        vocab_total: log.vocab_total ?? null,
        assessment_results: row.assessment_results ?? null,
        assessment_totals: log.assessment_totals ?? null,
      });
    }
    if ((data ?? []).length < HISTORY_PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

// 특정 완료 일지들의 학생 기록 전체 — 월말평가 석차를 "당시 응시자" 기준으로 계산하기 위해
// (현재 반 명단으로 걸러진 기록만 쓰면 반을 옮긴 학생이 빠져 과거 석차가 바뀐다). 일지 id 묶음으로 한 번에.
export async function getCompletedLogResults(dailyLogIds: readonly string[]) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user || dailyLogIds.length === 0) {
    return [] as AssessmentHistoryRow[];
  }

  const { data, error } = await supabase
    .from("student_lesson_logs")
    .select(
      "student_id, daily_log_id, attendance, vocab_correct, vocab_retest, assessment_results, daily_logs!inner(class_date, status, created_at, vocab_total, assessment_totals)",
    )
    .eq("user_id", user.id)
    .eq("daily_logs.status", "completed")
    .in("daily_log_id", [...dailyLogIds]);

  if (error) {
    console.error("getCompletedLogResults error", { code: error.code, message: error.message });
    return [] as AssessmentHistoryRow[];
  }

  type Raw = {
    student_id: string;
    daily_log_id: string;
    attendance: AttendanceStatus;
    vocab_correct: number | null;
    vocab_retest: boolean | null;
    assessment_results?: unknown;
    daily_logs: unknown;
  };
  return ((data ?? []) as unknown as Raw[]).flatMap((row) => {
    const log = pickOne<{ class_date: string; created_at: string | null; vocab_total: number | null; assessment_totals?: unknown }>(row.daily_logs);
    return log
      ? [{
          student_id: row.student_id,
          daily_log_id: row.daily_log_id,
          attendance: row.attendance,
          class_date: log.class_date,
          log_created_at: log.created_at ?? null,
          vocab_correct: row.vocab_correct ?? null,
          vocab_retest: Boolean(row.vocab_retest),
          vocab_total: log.vocab_total ?? null,
          assessment_results: row.assessment_results ?? null,
          assessment_totals: log.assessment_totals ?? null,
        } satisfies AssessmentHistoryRow]
      : [];
  });
}
