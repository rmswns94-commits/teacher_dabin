import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DailyLogForm, type DailyLogFormStudent } from "@/components/daily-log-form";
import { PageHeader } from "@/components/page-header";
import { formatKoreanDate } from "@/lib/dates";
import { mergeLegacyLessonContent } from "@/lib/progress";
import {
  getDailyLogDetailForCurrentUser,
  getPraisesForDailyLog,
} from "@/lib/supabase/queries/daily-logs";
import { getGroupStudentsForCurrentUser } from "@/lib/supabase/queries/groups";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";

export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [log, praiseRows] = await Promise.all([
    getDailyLogDetailForCurrentUser(id),
    getPraisesForDailyLog(id),
  ]);

  if (!log) {
    notFound();
  }

  // 칭찬 한표 복원: comment가 있는 manual praise 전부 폼에서 편집한다 (입력 순서 유지).
  // legacy category 칭찬(comment null)은 폼에 싣지 않고 그대로 보존된다.
  const praiseCommentsByStudent = new Map<string, string[]>();
  for (const praise of praiseRows) {
    if (praise.comment) {
      praiseCommentsByStudent.set(praise.student_id, [
        ...(praiseCommentsByStudent.get(praise.student_id) ?? []),
        praise.comment,
      ]);
    }
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
          homeworkStatus: lessonLog.homework_status ?? "",
          vocabCorrect: lessonLog.vocab_correct === null ? "" : String(lessonLog.vocab_correct),
          vocabRetest: lessonLog.vocab_retest,
          focusLevel: lessonLog.focus_level ?? "",
          participationLevel: lessonLog.participation_level ?? "",
          questionLevel: lessonLog.question_level ?? "",
          kindnessLevel: lessonLog.kindness_level ?? "",
          effortLevel: lessonLog.effort_level ?? "",
          parentNote: lessonLog.parent_note ?? "",
        },
        praiseComments: praiseCommentsByStudent.get(lessonLog.student!.id) ?? [],
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
  const [currentMembers, groupSchedules] = await Promise.all([
    getGroupStudentsForCurrentUser(log.group_id),
    // 다음 수업 계획 기본 날짜 계산용 시간표 (legacy row는 저장 전까지 DB 미변경)
    getGroupSchedules(log.group_id),
  ]);

  for (const member of currentMembers) {
    if (!member.archived && !knownIds.has(member.id)) {
      students.push({ studentId: member.id, name: member.name, grade: member.grade });
    }
  }

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          backHref={`/daily-logs/${log.id}`}
          title="수업 일지 수정"
          description={`${formatKoreanDate(log.class_date, true)} · ${log.group?.name ?? "그룹 정보 없음"}`}
        />

        <DailyLogForm
          dailyLogId={log.id}
          classDate={log.class_date}
          group={{ id: log.group_id, name: log.group?.name ?? "수업 그룹", grade: log.group?.grade }}
          students={students}
          scheduleDays={groupSchedules.map((slot) => slot.day_of_week)}
          initial={{
            title: log.title ?? "",
            // migration 미적용 legacy row도 수업 내용을 잃지 않게 병합해 편집한다
            // (이미 병합된 row는 그대로 — 중복 없음)
            defaultProgress: mergeLegacyLessonContent(log.default_progress, log.lesson_content),
            memo: log.memo ?? "",
            homework: log.homework ?? "",
            nextLessonPlan: log.next_lesson_plan ?? "",
            nextPlanDate: log.next_plan_date ?? "",
            vocabTotal: log.vocab_total === null ? "" : String(log.vocab_total),
          }}
        />
      </main>
    </AppShell>
  );
}
