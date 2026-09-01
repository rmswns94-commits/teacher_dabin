import { AppShell } from "@/components/app-shell";
import { MakeupsBoard, type MakeupRow, type TeacherSlot } from "@/components/makeups-board";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { todayDateString } from "@/lib/dates";
import { formatGrade } from "@/lib/grades";
import { formatTimeHM } from "@/lib/schedule";
import { getCurrentUserMakeups } from "@/lib/supabase/queries/makeups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";

export default async function MakeupsPage() {
  const today = todayDateString();
  const [makeups, schedules] = await Promise.all([
    getCurrentUserMakeups(),
    getCurrentUserSchedulesWithGroup(),
  ]);

  const rows: MakeupRow[] = makeups.map((makeup) => ({
    id: makeup.id,
    status: makeup.status,
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

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto max-w-[1000px]">
          <PageHeader title="보충수업" description="놓친 수업을 잊지 않고 챙겨요." />

          {rows.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#4c4c55]">
                아직 보충수업 기록이 없어요.
                <br />
                수업일지에서 결석 학생에게 &ldquo;보충 필요&rdquo;를 체크하면 여기에 자동으로 모여요.
              </CardContent>
            </Card>
          ) : (
            <MakeupsBoard makeups={rows} today={today} slots={slots} />
          )}

          <div className="pb-10" />
        </div>
      </main>
    </AppShell>
  );
}
