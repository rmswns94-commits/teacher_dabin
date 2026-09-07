import { AppShell } from "@/components/app-shell";
import {
  MakeupsBoard,
  type MakeupRow,
  type MakeupStudentOption,
  type TeacherSlot,
} from "@/components/makeups-board";
import { PageHeader } from "@/components/page-header";
import { todayDateString } from "@/lib/dates";
import { formatGrade } from "@/lib/grades";
import { formatTimeHM } from "@/lib/schedule";
import { getCurrentUserMakeups } from "@/lib/supabase/queries/makeups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import {
  getCurrentUserMemberships,
  getCurrentUserStudents,
} from "@/lib/supabase/queries/students";

export default async function MakeupsPage() {
  const today = todayDateString();
  const [makeups, schedules, students, memberships, groups] = await Promise.all([
    getCurrentUserMakeups(),
    getCurrentUserSchedulesWithGroup(),
    // 직접 등록 다이얼로그용 학생/소속 그룹 — 전부 batch (학생별 쿼리 없음)
    getCurrentUserStudents(),
    getCurrentUserMemberships(),
    getCurrentUserGroups(),
  ]);

  const rows: MakeupRow[] = makeups.map((makeup) => ({
    id: makeup.id,
    status: makeup.status,
    source: makeup.source ?? "absence",
    studentId: makeup.student?.id ?? null,
    studentName: makeup.student?.name ?? "학생 정보 없음",
    gradeLabel: makeup.student ? formatGrade(makeup.student.grade) : "",
    groupId: makeup.group?.id ?? null,
    groupName: makeup.group?.name ?? null,
    dailyLogId: makeup.dailyLogId,
    absenceDate: makeup.original_class_date,
    missedProgress: makeup.missed_progress,
    scheduledDate: makeup.scheduled_date,
    startTime: makeup.start_time ? formatTimeHM(makeup.start_time) : null,
    endTime: makeup.end_time ? formatTimeHM(makeup.end_time) : null,
    completedDate: makeup.completed_date,
    completedProgress: makeup.completed_progress,
    comment: makeup.comment,
  }));

  // 보충 일정 다이얼로그의 "정규 수업과 겹침" 경고용
  const slots: TeacherSlot[] = schedules.map((slot) => ({
    day_of_week: slot.day_of_week,
    start_time: slot.start_time,
    end_time: slot.end_time,
    groupName: slot.group?.name ?? "다른 반",
  }));

  // 학생별 소속 그룹 (membership batch 1쿼리 → map 조립)
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const groupsByStudent = new Map<string, { id: string; name: string }[]>();
  for (const membership of memberships) {
    const name = groupNameById.get(membership.group_id);
    if (!name) {
      continue;
    }
    groupsByStudent.set(membership.student_id, [
      ...(groupsByStudent.get(membership.student_id) ?? []),
      { id: membership.group_id, name },
    ]);
  }

  const studentOptions: MakeupStudentOption[] = students
    .map((student) => ({
      id: student.id,
      name: student.name,
      gradeLabel: formatGrade(student.grade),
      groups: groupsByStudent.get(student.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto max-w-[1000px]">
          <PageHeader
            title="보충 수업"
            description="결석한 학생의 보충 일정을 관리하고, 필요한 보충 수업을 직접 등록해요."
          />

          {/* 보충이 0건이어도 board를 렌더 — [보충 수업 등록] 버튼은 항상 접근 가능 */}
          <MakeupsBoard makeups={rows} today={today} slots={slots} students={studentOptions} />

          <div className="pb-10" />
        </div>
      </main>
    </AppShell>
  );
}
