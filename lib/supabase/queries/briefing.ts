import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type {
  AttendanceStatus,
  HomeworkStatus,
  WeaknessCategory,
} from "@/lib/supabase/types";

// 수업 전 반 브리핑용 데이터 — 기존 데이터의 aggregation만 (새 데이터 생성 없음, AI 없음).
// 그룹 하나 기준 batch 4쿼리(멤버/마지막 일지/약점/오답) — 학생별 반복 쿼리 금지.

export type BriefingMember = { id: string; name: string };

export type BriefingLessonRow = {
  student_id: string;
  attendance: AttendanceStatus;
  homework_status: HomeworkStatus | null;
  vocab_correct: number | null;
  vocab_retest: boolean;
};

export type BriefingLastLog = {
  id: string;
  class_date: string;
  next_lesson_plan: string | null;
  homework: string | null;
  vocab_total: number | null;
  rows: BriefingLessonRow[];
};

export type BriefingWeakness = {
  student_id: string;
  title: string;
  category: WeaknessCategory;
  review_due_date: string | null;
};

export type BriefingMistake = { student_id: string; word: string; created_at: string };

export type GroupBriefingData = {
  members: BriefingMember[];
  lastLog: BriefingLastLog | null;
  dueWeaknesses: BriefingWeakness[];
  recentMistakes: BriefingMistake[];
};

const EMPTY: GroupBriefingData = {
  members: [],
  lastLog: null,
  dueWeaknesses: [],
  recentMistakes: [],
};

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export async function getGroupBriefingData(
  groupId: string,
  today: string, // KST "YYYY-MM-DD" — 복습 필요(due) 판정 기준
  mistakesSince: string, // 반복 오답 집계 창 시작 (YYYY-MM-DD)
  // 직전 수업 cutoff (exclusive) — 이 그룹의 lesson_date가 이 날짜 이전인 일지만
  // "마지막 수업" source로 쓴다. 오늘 일지를 수업 전에 미리 Final Save해도
  // 수업 종료 전 브리핑에 조기 반영되지 않게 한다 (previousLessonSourceCutoff 참고).
  previousBefore: string,
): Promise<GroupBriefingData> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return EMPTY;
  }

  // 1) 그룹 멤버 (이름 표시용 — 다른 쿼리의 batch 기준 id 집합)
  const { data: memberRows, error: memberError } = await supabase
    .from("student_group_memberships")
    .select("student_id, students(id, name, archived)")
    .eq("user_id", user.id)
    .eq("group_id", groupId);

  if (memberError) {
    console.error("getGroupBriefingData member error", memberError);
    return EMPTY;
  }

  const members = (memberRows ?? [])
    .map((row) => pickOne<{ id: string; name: string; archived: boolean }>(row.students))
    .filter((student): student is { id: string; name: string; archived: boolean } =>
      Boolean(student && !student.archived),
    )
    .map((student) => ({ id: student.id, name: student.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  if (members.length === 0) {
    return EMPTY;
  }

  const memberIds = members.map((member) => member.id);

  // 2) 마지막 finalized(completed) 일지 + 학생별 기록 embed (숙제/결석/지난 단어시험/오늘 진도)
  // 3) 복습 필요 약점 (Phase 1): active + due가 오늘이거나 지난 것
  // 4) 최근 오답 (Phase 2): 반복 오답 집계 창
  const [logResult, weaknessResult, mistakeResult] = await Promise.all([
    supabase
      .from("daily_logs")
      .select(
        "id, class_date, next_lesson_plan, homework, vocab_total, student_lesson_logs(student_id, attendance, homework_status, vocab_correct, vocab_retest)",
      )
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .eq("status", "completed")
      .lt("class_date", previousBefore)
      .order("class_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("student_weaknesses")
      .select("student_id, title, category, review_due_date")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("review_due_date", today)
      .in("student_id", memberIds)
      .order("review_due_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("vocab_mistakes")
      // daily_log embed는 "이 그룹의 아직 안 끝난 수업" 오답을 걸러내기 위한 것 (아래 JS 필터)
      .select("student_id, word, created_at, daily_log:daily_logs(group_id, class_date)")
      .eq("user_id", user.id)
      .gte("created_at", mistakesSince)
      .in("student_id", memberIds)
      .order("created_at", { ascending: false }),
  ]);

  if (logResult.error) {
    console.error("getGroupBriefingData log error", logResult.error);
  }
  // 약점/오답은 migration 미적용 등 실패해도 브리핑 자체는 떠야 한다 — 해당 섹션만 숨김
  if (weaknessResult.error) {
    console.error("getGroupBriefingData weakness error", {
      code: weaknessResult.error.code,
      message: weaknessResult.error.message,
    });
  }
  if (mistakeResult.error) {
    console.error("getGroupBriefingData mistake error", {
      code: mistakeResult.error.code,
      message: mistakeResult.error.message,
    });
  }

  const logRow = logResult.data as
    | (Omit<BriefingLastLog, "rows"> & { student_lesson_logs: BriefingLessonRow[] | null })
    | null;

  return {
    members,
    lastLog: logRow
      ? {
          id: logRow.id,
          class_date: logRow.class_date,
          next_lesson_plan: logRow.next_lesson_plan,
          homework: logRow.homework,
          vocab_total: logRow.vocab_total,
          rows: (logRow.student_lesson_logs ?? []) as BriefingLessonRow[],
        }
      : null,
    dueWeaknesses: (weaknessResult.data ?? []) as BriefingWeakness[],
    // 이 그룹의 cutoff 이후(오늘 등 아직 안 끝난 occurrence) 일지에서 나온 오답은 제외 —
    // 오늘 단어시험을 미리 기록해도 수업 종료 전 "반복 오답"에 조기 집계되지 않는다.
    // 다른 그룹 수업의 오답(학생 기준 history)은 기존 의미 그대로 유지한다.
    recentMistakes: ((mistakeResult.data ?? []) as (BriefingMistake & {
      daily_log: { group_id: string; class_date: string } | { group_id: string; class_date: string }[] | null;
    })[])
      .filter((mistake) => {
        const log = pickOne<{ group_id: string; class_date: string }>(mistake.daily_log);
        return !(log && log.group_id === groupId && log.class_date >= previousBefore);
      })
      .map(({ student_id, word, created_at }) => ({ student_id, word, created_at })),
  };
}
