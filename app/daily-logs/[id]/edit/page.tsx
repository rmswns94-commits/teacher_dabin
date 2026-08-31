import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DailyLogForm, type DailyLogFormStudent } from "@/components/daily-log-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import { getDailyLogDetailForCurrentUser } from "@/lib/supabase/queries/daily-logs";
import { getGroupStudentsForCurrentUser } from "@/lib/supabase/queries/groups";

export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await getDailyLogDetailForCurrentUser(id);

  if (!log) {
    notFound();
  }

  const makeupByLessonLog = new Map(
    log.makeups.filter((makeup) => makeup.student_lesson_log_id).map((makeup) => [makeup.student_lesson_log_id, makeup]),
  );

  const students: DailyLogFormStudent[] = log.lessonLogs
    .filter((lessonLog) => lessonLog.student)
    .map((lessonLog) => {
      const makeup = makeupByLessonLog.get(lessonLog.id);

      return {
        studentId: lessonLog.student!.id,
        name: lessonLog.student!.name,
        grade: lessonLog.student!.grade,
        entry: {
          attendance: lessonLog.attendance,
          progress: lessonLog.progress ?? "",
          strengths: lessonLog.strengths ?? "",
          improvements: lessonLog.improvements ?? "",
          memo: lessonLog.memo ?? "",
        },
        makeup: makeup
          ? {
              status: makeup.status,
              scheduledDate: makeup.scheduled_date ?? "",
              missedProgress: makeup.missed_progress ?? "",
            }
          : null,
      };
    });

  // Students who joined the group after this log was written can still be added.
  const knownIds = new Set(students.map((student) => student.studentId));
  const currentMembers = await getGroupStudentsForCurrentUser(log.group_id);

  for (const member of currentMembers) {
    if (!member.archived && !knownIds.has(member.id)) {
      students.push({ studentId: member.id, name: member.name, grade: member.grade });
    }
  }

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="수업 일지 수정"
          description={`${formatKoreanDate(log.class_date, true)} · ${log.group?.name ?? "그룹 정보 없음"}`}
          action={
            <Button variant="secondary" asChild>
              <Link href={`/daily-logs/${log.id}`}>상세로 돌아가기</Link>
            </Button>
          }
        />

        <DailyLogForm
          dailyLogId={log.id}
          classDate={log.class_date}
          group={{ id: log.group_id, name: log.group?.name ?? "수업 그룹" }}
          students={students}
          initial={{
            title: log.title ?? "",
            lessonContent: log.lesson_content ?? "",
            defaultProgress: log.default_progress ?? "",
            memo: log.memo ?? "",
            homework: log.homework ?? "",
            nextLessonPlan: log.next_lesson_plan ?? "",
          }}
        />
      </main>
    </AppShell>
  );
}
