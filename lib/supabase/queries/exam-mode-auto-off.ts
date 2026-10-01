import { todayDateString } from "@/lib/dates";
import { resolveExamModeAutoOff, type AutoOffExamSource, type ExamAutoOffResult } from "@/lib/exam-mode-auto-off";
import { getCurrentUserGroups, setGroupExamPeriod } from "@/lib/supabase/queries/groups";
import { getSchoolExams, type SchoolExamListItem } from "@/lib/supabase/queries/school-exams";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupRecord } from "@/lib/supabase/types";

// AUTO EXAM MODE OFF — 중앙 reconciliation (조회 batch + 기존 OFF mutation 재사용).
// - 대상: 현재 사용자/학원(workspace RLS)의 is_exam_period=true 그룹만. 0개면 쿼리 0.
// - 조회: 그룹 목록(요청 캐시) + ON 그룹들의 멤버십/학생 1쿼리 + 학교 시험 목록 1쿼리 — 그룹/학생/학교별 반복 쿼리 없음.
// - 판정: lib/exam-mode-auto-off의 순수 resolver 하나 (그룹 상세 상태 UI와 같은 계산).
// - mutation: setGroupExamPeriod(groupId, false) — 수동 OFF와 같은 함수 (is_exam_period만 false,
//   대상 학교/시험 대비 교재/시험 record/일지 등 어떤 데이터도 지우지 않는다). 이미 OFF면 대상에서 빠지므로 멱등.
// - 자동 ON은 존재하지 않는다 (false → true 경로 없음).

type RosterStudent = { school: string | null; archived: boolean };

export function toAutoOffExamSources(rows: readonly SchoolExamListItem[]): AutoOffExamSource[] {
  return rows
    .filter((row) => row.event)
    .map((row) => ({
      id: row.id,
      schoolName: row.school_name,
      grade: row.grade,
      examYear: row.exam_year,
      semester: row.semester,
      examType: row.exam_type,
      startDate: row.event!.start_date,
      endDate: row.event!.end_date,
    }));
}

// migration(20261001) 전에는 컬럼이 없어 row에 키 자체가 없다 → undefined/null 모두 "anchor 없음"
export function examPeriodStartedOnOf(group: ClassGroupRecord): string | null {
  const value = (group as { exam_period_started_on?: string | null }).exam_period_started_on;
  return value ?? null;
}

async function loadRostersByGroup(groupIds: string[]) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();
  const map = new Map<string, RosterStudent[]>();
  if (!supabase || !user || groupIds.length === 0) {
    return { map, failed: !supabase || !user };
  }
  const { data, error } = await supabase
    .from("student_group_memberships")
    .select("group_id, students(id, school, archived)")
    .eq("user_id", user.id)
    .in("group_id", groupIds);
  if (error) {
    console.error("exam-mode-auto-off rosters error", { code: error.code, message: error.message });
    return { map, failed: true };
  }
  for (const row of (data ?? []) as { group_id: string; students: RosterStudent | RosterStudent[] | null }[]) {
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    if (!student) {
      continue;
    }
    map.set(row.group_id, [...(map.get(row.group_id) ?? []), { school: student.school ?? null, archived: Boolean(student.archived) }]);
  }
  return { map, failed: false };
}

export function resolveGroupAutoOff(
  group: ClassGroupRecord,
  roster: readonly RosterStudent[],
  exams: readonly AutoOffExamSource[],
  today: string,
): ExamAutoOffResult {
  return resolveExamModeAutoOff({
    isExamPeriod: Boolean(group.is_exam_period),
    startedOn: examPeriodStartedOnOf(group),
    groupGrade: group.grade,
    students: roster,
    exams,
    today,
  });
}

export async function reconcileExpiredExamModes(): Promise<{
  checked: number;
  turnedOff: { id: string; name: string }[];
}> {
  const groups = await getCurrentUserGroups();
  const onGroups = groups.filter((group) => group.is_exam_period);
  if (onGroups.length === 0) {
    return { checked: 0, turnedOff: [] };
  }

  const [rosters, exams] = await Promise.all([
    loadRostersByGroup(onGroups.map((group) => group.id)),
    getSchoolExams(),
  ]);
  if (rosters.failed || exams.failed) {
    // 조회 실패 = unknown → 아무것도 끄지 않는다 (불확실하면 ON 유지)
    return { checked: onGroups.length, turnedOff: [] };
  }

  const today = todayDateString();
  const sources = toAutoOffExamSources(exams.rows);
  const turnedOff: { id: string; name: string }[] = [];
  for (const group of onGroups) {
    const result = resolveGroupAutoOff(group, rosters.map.get(group.id) ?? [], sources, today);
    if (!result.eligible) {
      continue;
    }
    try {
      await setGroupExamPeriod(group.id, false); // 수동 OFF와 같은 mutation
      turnedOff.push({ id: group.id, name: group.name });
    } catch (error) {
      console.error("exam-mode-auto-off setGroupExamPeriod error", { groupId: group.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checked: onGroups.length, turnedOff };
}
