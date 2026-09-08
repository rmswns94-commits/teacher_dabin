import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DailyLogForm, type DailyLogFormStudent } from "@/components/daily-log-form";
import { PageHeader } from "@/components/page-header";
import { formatKoreanDate } from "@/lib/dates";
import { sortByKoreanName } from "@/lib/korean-sort";
import { mergeLegacyLessonContent } from "@/lib/progress";
import { getDailyLogDraft } from "@/lib/supabase/queries/daily-log-drafts";
import {
  getDailyLogDetailForCurrentUser,
  getPraisesForDailyLog,
  getPreviousReflectionNext,
} from "@/lib/supabase/queries/daily-logs";
import { getGroupStudentsForCurrentUser } from "@/lib/supabase/queries/groups";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";
import { getVocabMistakesForDailyLog } from "@/lib/supabase/queries/vocab-mistakes";

export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [log, praiseRows, mistakeRows, draftRow] = await Promise.all([
    getDailyLogDetailForCurrentUser(id),
    getPraisesForDailyLog(id),
    // 이 시험의 틀린 단어 (입력 순서 유지 — final 저장 시 폼 상태로 전체 교체)
    getVocabMistakesForDailyLog(id),
    // 이 일지의 수정 draft (있으면 폼에서 복구 배너 — 원본은 final 저장 전까지 불변)
    getDailyLogDraft({ dailyLogId: id }),
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

  const vocabMistakesByStudent = new Map<string, string[]>();
  for (const mistake of mistakeRows) {
    vocabMistakesByStudent.set(mistake.student_id, [
      ...(vocabMistakesByStudent.get(mistake.student_id) ?? []),
      mistake.word,
    ]);
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
        vocabMistakes: vocabMistakesByStudent.get(lessonLog.student!.id) ?? [],
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
  const [currentMembers, groupSchedules, prevReflection] = await Promise.all([
    getGroupStudentsForCurrentUser(log.group_id),
    // 다음 수업 계획 기본 날짜 계산용 시간표 (legacy row는 저장 전까지 DB 미변경)
    getGroupSchedules(log.group_id),
    // 이 일지 이전 completed 일지의 다짐 (자기 자신은 class_date 미만 조건으로 자연 제외)
    getPreviousReflectionNext(log.group_id, log.class_date),
  ]);

  for (const member of currentMembers) {
    if (!member.archived && !knownIds.has(member.id)) {
      students.push({ studentId: member.id, name: member.name, grade: member.grade });
    }
  }

  // 기존 기록 + 이후 합류한 학생을 합친 뒤 이름 가나다순으로 정렬해 폼에 로드한다.
  // 평가값은 entries가 studentId 기준이라 순서와 무관하게 정확히 연결된다.
  const sortedStudents = sortByKoreanName(
    students,
    (student) => student.name,
    (student) => student.studentId,
  );

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
          students={sortedStudents}
          scheduleDays={groupSchedules.map((slot) => slot.day_of_week)}
          draft={
            draftRow
              ? { id: draftRow.id, updatedAt: draftRow.updated_at, payload: draftRow.payload }
              : null
          }
          // 오늘 숙제(구조화) — id 기반 sync를 위해 row id까지 전달
          initialAssignments={log.homeworkAssignments.map((hw) => ({
            id: hw.id,
            content: hw.content,
            dueDate: hw.due_date,
          }))}
          initial={{
            title: log.title ?? "",
            // migration 미적용 legacy row도 수업 내용을 잃지 않게 병합해 편집한다
            // (이미 병합된 row는 그대로 — 중복 없음)
            defaultProgress: mergeLegacyLessonContent(log.default_progress, log.lesson_content),
            memo: log.memo ?? "",
            homework: log.homework ?? "",
            homeworkDueDate: log.homework_due_date ?? "",
            nextLessonPlan: log.next_lesson_plan ?? "",
            nextPlanDate: log.next_plan_date ?? "",
            // 해야 할 일 — 일지 row가 source (Todo 삭제/완료와 무관하게 폼 복원)
            taskContent: log.task_content ?? "",
            taskDate: log.task_due_date ?? "",
            vocabTotal: log.vocab_total === null ? "" : String(log.vocab_total),
            reflectionGood: log.reflection_good ?? "",
            reflectionHard: log.reflection_hard ?? "",
            reflectionNext: log.reflection_next ?? "",
          }}
          previousReflection={
            prevReflection
              ? {
                  classDate: prevReflection.class_date,
                  reflectionNext: prevReflection.reflection_next,
                }
              : null
          }
        />
      </main>
    </AppShell>
  );
}
