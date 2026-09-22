import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { TextbookSection } from "@/lib/textbooks";
import type {
  AttendanceStatus,
  HomeworkStatus,
  WeaknessCategory,
} from "@/lib/supabase/types";

// 수업 전 반 브리핑용 데이터 — 기존 데이터의 aggregation만 (새 데이터 생성 없음, AI 없음).
// 그룹 하나 기준 batch 5쿼리(멤버/마지막 일지/약점/오답/학생별 밀린 숙제) — 학생별 반복 쿼리 금지.

export type BriefingMember = { id: string; name: string };

export type BriefingLessonRow = {
  student_id: string;
  attendance: AttendanceStatus;
  homework_status: HomeworkStatus | null;
  vocab_correct: number | null;
  vocab_retest: boolean;
  // 온라인 복습 평가 — 학생 체크 signal용 (false만 미완료, null=미선택은 signal 아님)
  online_review_completed: boolean | null;
};

export type BriefingLastLog = {
  id: string;
  class_date: string;
  next_lesson_plan: string | null;
  textbook_plans: TextbookSection[] | null;
  school_plans: TextbookSection[] | null;
  homeworkAssignments: BriefingHomework[];
  homework: string | null;
  vocab_total: number | null;
  rows: BriefingLessonRow[];
};

export type BriefingHomework = {
  id: string;
  content: string;
  due_date: string;
  sort_order: number;
  textbook: string | null;
  school: string | null;
  assignedStudentName: string | null;
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
  // 학생 체크 signal용 — 이 그룹 멤버에게 배정된(assigned_student_id) 미완료 + due<=오늘 숙제.
  // 공통 숙제(assigned null)는 애초에 조회하지 않는다 (학생별 완료 상태가 아니므로).
  overdueStudentHomework: { assigned_student_id: string }[];
};

// 멤버가 없거나 조회에 실패한 그룹의 브리핑 — 섹션이 전부 "없음"으로 렌더된다
export const EMPTY_GROUP_BRIEFING: GroupBriefingData = {
  members: [],
  lastLog: null,
  dueWeaknesses: [],
  recentMistakes: [],
  overdueStudentHomework: [],
};

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

type LastLogRow = Omit<BriefingLastLog, "rows" | "homeworkAssignments"> & {
  student_lesson_logs: BriefingLessonRow[] | null;
  daily_log_homework_assignments: (Omit<BriefingHomework, "assignedStudentName"> & {
    assigned_student: { name: string } | { name: string }[] | null;
  })[] | null;
};

type MistakeRow = BriefingMistake & {
  daily_log: { group_id: string; class_date: string } | { group_id: string; class_date: string }[] | null;
};

// 여러 그룹의 브리핑 데이터를 한 번에 — 대시보드가 "오늘 수업 그룹 전부"를 미리 적재해
// 이전/다음 탐색 때 추가 쿼리가 0이 되게 한다 (N+1 금지). 쿼리 수는 그룹 수와 무관하게
// 멤버 1 + 약점 1 + 오답 1 + 밀린 숙제 1, 여기에 "그룹별 마지막 Finalized 1건"만 그룹 수만큼
// (limit 1 정렬 쿼리라 그룹당 1개가 결정적 — 병렬 실행).
// 단일 그룹용 getGroupBriefingData는 이 함수의 wrapper다 (판정/필터 로직은 한 곳).
export async function getGroupsBriefingData(
  groupIds: string[],
  today: string, // KST "YYYY-MM-DD" — 복습 필요(due) 판정 기준
  mistakesSince: string, // 반복 오답 집계 창 시작 (YYYY-MM-DD)
  // 직전 수업 cutoff (exclusive) — 그룹의 lesson_date가 이 날짜 이전인 일지만
  // "마지막 수업" source로 쓴다. 오늘 일지를 수업 전에 미리 Final Save해도
  // 수업 종료 전 브리핑에 조기 반영되지 않게 한다 (previousLessonSourceCutoff 참고).
  previousBefore: string,
): Promise<Map<string, GroupBriefingData>> {
  const result = new Map<string, GroupBriefingData>();
  const uniqueGroupIds = [...new Set(groupIds)];
  if (uniqueGroupIds.length === 0) {
    return result;
  }

  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return result;
  }

  // 1) 그룹 멤버 (이름 표시용 — 다른 쿼리의 batch 기준 id 집합) — 그룹 전체 1쿼리
  const { data: memberRows, error: memberError } = await supabase
    .from("student_group_memberships")
    .select("group_id, student_id, students(id, name, archived)")
    .eq("user_id", user.id)
    .in("group_id", uniqueGroupIds);

  if (memberError) {
    console.error("getGroupsBriefingData member error", memberError);
    return result;
  }

  const membersByGroup = new Map<string, BriefingMember[]>();
  for (const row of memberRows ?? []) {
    const student = pickOne<{ id: string; name: string; archived: boolean }>(row.students);
    if (!student || student.archived) {
      continue;
    }
    const groupId = row.group_id as string;
    membersByGroup.set(groupId, [...(membersByGroup.get(groupId) ?? []), { id: student.id, name: student.name }]);
  }
  for (const members of membersByGroup.values()) {
    members.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  const groupsWithMembers = uniqueGroupIds.filter((groupId) => (membersByGroup.get(groupId) ?? []).length > 0);
  const allMemberIds = [...new Set(groupsWithMembers.flatMap((groupId) => membersByGroup.get(groupId)!.map((m) => m.id)))];

  if (allMemberIds.length === 0) {
    return result;
  }

  // 2) 그룹별 마지막 finalized(completed) 일지 + 학생별 기록 embed (숙제/결석/지난 단어시험/오늘 진도)
  // 3) 복습 필요 약점 (Phase 1): active + due가 오늘이거나 지난 것 — 멤버 전체 1쿼리
  // 4) 최근 오답 (Phase 2): 반복 오답 집계 창 — 멤버 전체 1쿼리
  // 5) 학생 체크 — 멤버에게 배정된 개인 숙제 중 미완료 + due<=오늘 (undated는 DB상 불가).
  //    학생별 반복 쿼리 금지: 멤버 id 집합으로 batch 1쿼리. 공통 숙제(assigned null)는 제외 —
  //    완료 상태가 assignment 단위라 학생별 미완료로 배분할 수 없다.
  const [logResults, weaknessResult, mistakeResult, overdueHwResult] = await Promise.all([
    Promise.all(
      groupsWithMembers.map((groupId) =>
        supabase
          .from("daily_logs")
          .select(
            "id, class_date, next_lesson_plan, textbook_plans, school_plans, homework, vocab_total, student_lesson_logs(student_id, attendance, homework_status, vocab_correct, vocab_retest, online_review_completed), daily_log_homework_assignments(id, content, due_date, sort_order, textbook, school, assigned_student:students(name))",
          )
          .eq("user_id", user.id)
          .eq("group_id", groupId)
          .eq("status", "completed")
          .lt("class_date", previousBefore)
          .order("class_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ),
    supabase
      .from("student_weaknesses")
      .select("student_id, title, category, review_due_date")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("review_due_date", today)
      .in("student_id", allMemberIds)
      .order("review_due_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("vocab_mistakes")
      // daily_log embed는 "이 그룹의 아직 안 끝난 수업" 오답을 걸러내기 위한 것 (아래 JS 필터)
      .select("student_id, word, created_at, daily_log:daily_logs(group_id, class_date)")
      .eq("user_id", user.id)
      .gte("created_at", mistakesSince)
      .in("student_id", allMemberIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("daily_log_homework_assignments")
      .select("assigned_student_id")
      .eq("user_id", user.id)
      .eq("completed", false)
      .lte("due_date", today)
      .not("assigned_student_id", "is", null)
      .in("assigned_student_id", allMemberIds),
  ]);

  // 약점/오답은 migration 미적용 등 실패해도 브리핑 자체는 떠야 한다 — 해당 섹션만 숨김
  if (weaknessResult.error) {
    console.error("getGroupsBriefingData weakness error", {
      code: weaknessResult.error.code,
      message: weaknessResult.error.message,
    });
  }
  if (overdueHwResult.error) {
    console.error("getGroupsBriefingData overdue homework error", {
      code: overdueHwResult.error.code,
      message: overdueHwResult.error.message,
    });
  }
  if (mistakeResult.error) {
    console.error("getGroupsBriefingData mistake error", {
      code: mistakeResult.error.code,
      message: mistakeResult.error.message,
    });
  }

  const weaknesses = (weaknessResult.data ?? []) as BriefingWeakness[];
  const mistakes = (mistakeResult.data ?? []) as MistakeRow[];
  // 실패 시 빈 목록 — 학생 체크가 "전원 확인 필요" 같은 false positive를 만들지 않는다
  const overdueHomework = overdueHwResult.error
    ? []
    : ((overdueHwResult.data ?? []) as { assigned_student_id: string }[]);

  groupsWithMembers.forEach((groupId, index) => {
    const members = membersByGroup.get(groupId)!;
    const memberIdSet = new Set(members.map((member) => member.id));
    const logResult = logResults[index];
    if (logResult.error) {
      console.error("getGroupsBriefingData log error", logResult.error);
    }
    const logRow = (logResult.data ?? null) as LastLogRow | null;

    result.set(groupId, {
      members,
      lastLog: logRow
        ? {
            id: logRow.id,
            class_date: logRow.class_date,
            next_lesson_plan: logRow.next_lesson_plan,
            textbook_plans: logRow.textbook_plans,
            school_plans: logRow.school_plans,
            // Same selected log, all completion states, names embedded in the same query.
            homeworkAssignments: (logRow.daily_log_homework_assignments ?? [])
              .map(({ assigned_student, ...item }) => ({
                ...item,
                assignedStudentName: pickOne<{ name: string }>(assigned_student)?.name ?? null,
              }))
              .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order),
            homework: logRow.homework,
            vocab_total: logRow.vocab_total,
            rows: (logRow.student_lesson_logs ?? []) as BriefingLessonRow[],
          }
        : null,
      dueWeaknesses: weaknesses.filter((weakness) => memberIdSet.has(weakness.student_id)),
      // 이 그룹의 cutoff 이후(오늘 등 아직 안 끝난 occurrence) 일지에서 나온 오답은 제외 —
      // 오늘 단어시험을 미리 기록해도 수업 종료 전 "반복 오답"에 조기 집계되지 않는다.
      // 다른 그룹 수업의 오답(학생 기준 history)은 기존 의미 그대로 유지한다.
      recentMistakes: mistakes
        .filter((mistake) => memberIdSet.has(mistake.student_id))
        .filter((mistake) => {
          const log = pickOne<{ group_id: string; class_date: string }>(mistake.daily_log);
          return !(log && log.group_id === groupId && log.class_date >= previousBefore);
        })
        .map(({ student_id, word, created_at }) => ({ student_id, word, created_at })),
      overdueStudentHomework: overdueHomework.filter((row) => memberIdSet.has(row.assigned_student_id)),
    });
  });

  return result;
}

export async function getGroupBriefingData(
  groupId: string,
  today: string,
  mistakesSince: string,
  previousBefore: string,
): Promise<GroupBriefingData> {
  const byGroup = await getGroupsBriefingData([groupId], today, mistakesSince, previousBefore);
  return byGroup.get(groupId) ?? EMPTY_GROUP_BRIEFING;
}
