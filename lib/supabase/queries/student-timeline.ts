import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  AttendanceStatus,
  MakeupStatus,
  PraiseCategory,
  SchoolExamType,
} from "@/lib/supabase/types";

// 학생 통합 타임라인의 원본 조회 — source마다 range batch 1~2쿼리다.
// 수업마다 출결/평가/숙제를 다시 묻지 않는다 (N+1 금지).
// 어떤 함수도 데이터를 쓰지 않는다 — 순수 조회다.

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }
  return (value ?? null) as T | null;
}

export type TimelineLessonRow = {
  id: string;
  attendance: AttendanceStatus;
  progress: string | null;
  strengths: string | null;
  improvements: string | null;
  memo: string | null;
  online_review_completed: boolean | null;
  dailyLog: {
    id: string;
    class_date: string;
    title: string | null;
    default_progress: string | null;
    lesson_content: string | null;
    group: { id: string; name: string; icon: string | null } | null;
  };
};

// 완료(Finalized)된 수업만 — 작성 중 일지는 아직 학생 활동 기록이 아니다.
export async function getStudentTimelineLessons(studentId: string, sinceDate: string | null) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as TimelineLessonRow[];
  }

  let query = supabase
    .from("student_lesson_logs")
    .select(
      "id, attendance, progress, strengths, improvements, memo, online_review_completed, daily_logs!inner(id, class_date, title, default_progress, lesson_content, status, class_groups(id, name, icon))",
    )
    .eq("user_id", user.id)
    .eq("student_id", studentId)
    .eq("daily_logs.status", "completed");

  if (sinceDate) {
    query = query.gte("daily_logs.class_date", sinceDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getStudentTimelineLessons error", error);
    return [] as TimelineLessonRow[];
  }

  return (data ?? []).flatMap((row) => {
    const log = pickOne<Record<string, unknown>>(row.daily_logs);
    if (!log) {
      return [];
    }

    return [
      {
        id: row.id as string,
        attendance: row.attendance as AttendanceStatus,
        progress: (row.progress ?? null) as string | null,
        strengths: (row.strengths ?? null) as string | null,
        improvements: (row.improvements ?? null) as string | null,
        memo: (row.memo ?? null) as string | null,
        online_review_completed: (row.online_review_completed ?? null) as boolean | null,
        dailyLog: {
          id: log.id as string,
          class_date: log.class_date as string,
          title: (log.title ?? null) as string | null,
          default_progress: (log.default_progress ?? null) as string | null,
          lesson_content: (log.lesson_content ?? null) as string | null,
          group: pickOne<{ id: string; name: string; icon: string | null }>(log.class_groups),
        },
      } satisfies TimelineLessonRow,
    ];
  });
}

export type TimelineHomeworkRow = {
  id: string;
  daily_log_id: string;
  content: string;
  due_date: string;
  textbook: string | null;
  school: string | null;
  assigned_student_id: string | null;
  completed: boolean;
  completed_at: string | null;
};

// 이 학생의 숙제 — 두 갈래를 각각 batch 1쿼리로 가져온다.
//  1) 이 학생에게 직접 배정된 숙제 (assigned_student_id = 학생)
//  2) 그 학생이 실제로 들은 수업의 공통 숙제 (assigned_student_id is null)
// 공통 숙제를 "지금 그 반 소속인가"로 판단하지 않는 이유: 반을 옮긴 뒤에도 과거 공통 숙제는
// 그때 그 수업을 들은 학생의 기록이기 때문이다 (현재 소속으로 과거를 다시 계산하지 않는다).
export async function getStudentTimelineHomework(
  studentId: string,
  attendedDailyLogIds: readonly string[],
  sinceDate: string | null,
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as TimelineHomeworkRow[];
  }

  const columns =
    "id, daily_log_id, content, due_date, textbook, school, assigned_student_id, completed, completed_at";

  const assignedQuery = supabase
    .from("daily_log_homework_assignments")
    .select(columns)
    .eq("user_id", user.id)
    .eq("assigned_student_id", studentId);

  const commonQuery = supabase
    .from("daily_log_homework_assignments")
    .select(columns)
    .eq("user_id", user.id)
    .is("assigned_student_id", null)
    .in("daily_log_id", attendedDailyLogIds.length > 0 ? [...attendedDailyLogIds] : ["00000000-0000-0000-0000-000000000000"]);

  const [assigned, common] = await Promise.all([
    sinceDate ? assignedQuery.gte("due_date", sinceDate) : assignedQuery,
    sinceDate ? commonQuery.gte("due_date", sinceDate) : commonQuery,
  ]);

  if (assigned.error) {
    console.error("getStudentTimelineHomework assigned error", assigned.error);
  }
  if (common.error) {
    console.error("getStudentTimelineHomework common error", common.error);
  }

  const rows = [...(assigned.data ?? []), ...(common.data ?? [])] as TimelineHomeworkRow[];
  // 두 쿼리가 겹칠 일은 없지만(조건이 배타적) id 기준으로 한 번 더 정리한다
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export type TimelineMakeupRow = {
  id: string;
  status: MakeupStatus;
  original_class_date: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  completed_date: string | null;
  missed_progress: string | null;
  completed_progress: string | null;
  comment: string | null;
  group: { id: string; name: string; icon: string | null } | null;
};

export async function getStudentTimelineMakeups(studentId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as TimelineMakeupRow[];
  }

  const { data, error } = await supabase
    .from("makeup_lessons")
    .select(
      "id, status, original_class_date, scheduled_date, start_time, end_time, completed_date, missed_progress, completed_progress, comment, class_groups(id, name, icon)",
    )
    .eq("user_id", user.id)
    .eq("student_id", studentId);

  if (error) {
    console.error("getStudentTimelineMakeups error", error);
    return [] as TimelineMakeupRow[];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as MakeupStatus,
    original_class_date: row.original_class_date as string,
    scheduled_date: (row.scheduled_date ?? null) as string | null,
    start_time: (row.start_time ?? null) as string | null,
    end_time: (row.end_time ?? null) as string | null,
    completed_date: (row.completed_date ?? null) as string | null,
    missed_progress: (row.missed_progress ?? null) as string | null,
    completed_progress: (row.completed_progress ?? null) as string | null,
    comment: (row.comment ?? null) as string | null,
    group: pickOne<{ id: string; name: string; icon: string | null }>(row.class_groups),
  }));
}

export type TimelinePraiseRow = {
  id: string;
  category: PraiseCategory;
  comment: string | null;
  daily_log_id: string | null;
  created_at: string;
};

export async function getStudentTimelinePraises(studentId: string, sinceDate: string | null) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as TimelinePraiseRow[];
  }

  let query = supabase
    .from("student_praises")
    .select("id, category, comment, daily_log_id, created_at")
    .eq("user_id", user.id)
    .eq("student_id", studentId);

  if (sinceDate) {
    query = query.gte("created_at", `${sinceDate}T00:00:00+09:00`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getStudentTimelinePraises error", error);
    return [] as TimelinePraiseRow[];
  }

  return (data ?? []) as TimelinePraiseRow[];
}

export type TimelineExamRow = {
  id: string;
  school_name: string;
  exam_type: SchoolExamType;
  exam_year: number;
  semester: 1 | 2;
  scope_text: string | null;
  start_date: string;
  end_date: string;
};

// 학생과 실제로 연결된 시험만 (school_exam_students relation).
// "학생 학교가 같으니 포함" 같은 추론은 하지 않는다.
export async function getStudentTimelineExams(studentId: string, sinceDate: string | null) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as TimelineExamRow[];
  }

  const { data, error } = await supabase
    .from("school_exam_students")
    .select(
      "school_exam_details!inner(id, school_name, exam_type, exam_year, semester, scope_text, calendar_events!inner(start_date, end_date))",
    )
    .eq("user_id", user.id)
    .eq("student_id", studentId);

  if (error) {
    // 시험 기능 migration 미적용 등은 "시험 기록 없음"으로 둔다 — 화면은 그대로 뜬다
    console.error("getStudentTimelineExams error", { code: error.code, message: error.message });
    return [] as TimelineExamRow[];
  }

  return (data ?? []).flatMap((row) => {
    const exam = pickOne<Record<string, unknown>>(row.school_exam_details);
    const event = exam ? pickOne<{ start_date: string; end_date: string }>(exam.calendar_events) : null;

    if (!exam || !event) {
      return [];
    }

    if (sinceDate && event.start_date < sinceDate) {
      return [];
    }

    return [
      {
        id: exam.id as string,
        school_name: exam.school_name as string,
        exam_type: exam.exam_type as SchoolExamType,
        exam_year: exam.exam_year as number,
        semester: exam.semester as 1 | 2,
        scope_text: (exam.scope_text ?? null) as string | null,
        start_date: event.start_date,
        end_date: event.end_date,
      } satisfies TimelineExamRow,
    ];
  });
}
