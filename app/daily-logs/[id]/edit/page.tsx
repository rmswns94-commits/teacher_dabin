import { notFound } from "next/navigation";

import { AdjacentLessonNav } from "@/components/adjacent-lesson-nav";
import { AppShell } from "@/components/app-shell";
import { DailyLogExamPreview } from "@/components/daily-log-exam-preview";
import { DailyLogForm, type DailyLogFormStudent } from "@/components/daily-log-form";
import { DailyLogPicker } from "@/components/daily-log-picker";
import { LessonHistoryWorkspace } from "@/components/lesson-history-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { sortByKoreanName } from "@/lib/korean-sort";
import { mergeLegacyLessonContent } from "@/lib/progress";
import { buildTextbookSectionsText, stripDerivedPrefix, uniqueSchoolList } from "@/lib/textbooks";
import { getDailyLogDraft } from "@/lib/supabase/queries/daily-log-drafts";
import {
  getDailyLogDetailForCurrentUser,
  getGroupHistoryLogs,
  getPraisesForDailyLog,
  getPreviousLessonImportSource,
  getPreviousReflectionNext,
  getPreviousStudentEvaluations,
} from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups, getGroupStudentsForCurrentUser } from "@/lib/supabase/queries/groups";
import { buildScheduleExceptionIndex } from "@/lib/schedule-exceptions";
import { getScheduleExceptionsInRange } from "@/lib/supabase/queries/schedule-exceptions";
import { getCurrentUserSchedulesWithGroup, getGroupSchedules } from "@/lib/supabase/queries/schedules";
import { getDailyLogExamPreviewEntries } from "@/lib/supabase/queries/school-exams";
import { getVocabMistakesForDailyLog } from "@/lib/supabase/queries/vocab-mistakes";
import { getAdjacentScheduledClasses } from "@/lib/adjacent-classes";
import { dayOfWeekOf } from "@/lib/schedule";

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

  // 이 일지의 수정 draft가 없으면, 같은 identity(group+date)의 "새 작성" 자동 임시저장을
  // fallback으로 보여준다 (중복 안내에서 이어쓰기로 넘어온 경우 등 — 보관된 내용의 유실 방지).
  // fallback은 자동 적용하지 않고 배너로만 안내한다 (일지 row 내용을 덮어쓰지 않게).
  const fallbackDraftRow = draftRow
    ? null
    : await getDailyLogDraft({ groupId: log.group_id, classDate: log.class_date });
  const effectiveDraftRow = draftRow ?? fallbackDraftRow;

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
        school: lessonLog.student!.school,
        entry: {
          attendance: lessonLog.attendance,
          progress: lessonLog.progress ?? "",
          strengths: lessonLog.strengths ?? "",
          improvements: lessonLog.improvements ?? "",
          memo: lessonLog.memo ?? "",
          homeworkStatus: lessonLog.homework_status ?? "",
          onlineReviewCompleted: lessonLog.online_review_completed ?? null,
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
  const [currentMembers, groupSchedules, prevReflection, allGroups, importSource, allSchedules, prevEvaluations, history, dateExceptions] = await Promise.all([
    getGroupStudentsForCurrentUser(log.group_id),
    // 다음 수업 계획 기본 날짜 계산용 시간표 (legacy row는 저장 전까지 DB 미변경)
    getGroupSchedules(log.group_id),
    // 이 일지 이전 completed 일지의 다짐 (자기 자신은 class_date 미만 조건으로 자연 제외)
    getPreviousReflectionNext(log.group_id, log.class_date),
    // 작성 중(draft) 일지 상단의 그룹/날짜 피커용 — 완료 일지 수정에는 표시하지 않는다
    log.status === "draft" ? getCurrentUserGroups() : Promise.resolve([]),
    // [지난 수업에서 가져오기] source — 이 일지 class_date "미만"의 최신 Finalized
    // (자기 자신은 lt 조건으로 자연 제외 — Finalized Edit에서도 안전)
    getPreviousLessonImportSource(log.group_id, log.class_date),
    // 이전/다음 수업 바로가기 — 전 그룹 시간표 (AppShell과 같은 요청당 1쿼리 cache, N+1 없음)
    getCurrentUserSchedulesWithGroup(),
    // 학생 평가 카드 "지난 수업 참고" — 이 일지 class_date "미만"의 직전 Finalized 학생 평가
    // (자기 자신은 lt 조건으로 자연 제외 — 과거 일지 수정에서도 그 시점 기준의 직전 수업)
    getPreviousStudentEvaluations(log.group_id, log.class_date),
    // 이전 수업 기록 사이드바 — 새 작성 화면과 같은 쿼리/컴포넌트 재사용.
    // 기준은 이 일지의 class_date "미만"(lt)이라 현재 수정 중인 일지는 자연 제외된다.
    // (draft 새로고침/완료 일지 수정이 이 edit 화면으로 오는데, 여기에만 사이드바가 없어
    //  Create에서 보이던 이전 기록이 사라지던 버그의 수정 — 실패해도 화면은 그대로 동작)
    getGroupHistoryLogs(log.group_id, log.class_date, 0, 10)
      .then((result) => ({ ...result, failed: false }))
      .catch(() => ({ rows: [], hasMore: false, failed: true })),
    // 이 일지 날짜의 정규수업 1회 예외 (이동 계산용 — 날짜 1개 range 1쿼리)
    getScheduleExceptionsInRange(log.class_date, log.class_date),
  ]);

  // 기준은 "이 일지의 class_date 요일" 정규 시간표뿐 (오늘 날짜 아님 — 과거 일지도 그 요일 기준)
  // 그 날짜의 1회 예외를 반영한다: 휴강은 이동 대상 제외, 시간 변경은 변경된 시각 순서.
  const adjacentClasses = getAdjacentScheduledClasses(
    allSchedules,
    dayOfWeekOf(log.class_date),
    log.group_id,
    { date: log.class_date, exceptions: buildScheduleExceptionIndex(dateExceptions) },
  );

  for (const member of currentMembers) {
    if (!member.archived && !knownIds.has(member.id)) {
      students.push({ studentId: member.id, name: member.name, grade: member.grade, school: member.school });
    }
  }

  // 기존 기록 + 이후 합류한 학생을 합친 뒤 이름 가나다순으로 정렬해 폼에 로드한다.
  // 평가값은 entries가 studentId 기준이라 순서와 무관하게 정확히 연결된다.
  const sortedStudents = sortByKoreanName(
    students,
    (student) => student.name,
    (student) => student.studentId,
  );

  // 시험 기간 ON: 학교별 시험 대비 캘린더 read-only 미리보기 (새 작성 화면과 동일 —
  // 현재 그룹 학생 학교 기준. 저장된 일지 데이터는 어떤 것도 변환/복제하지 않는다)
  // PHASE 2: 시험 대상 학교가 설정된 그룹은 대상 학교만 미리보기에 표시
  // (legacy null은 기존대로 전체 — 자동 mixed 전환 없음)
  const memberSchools = uniqueSchoolList(
    currentMembers.filter((member) => !member.archived).map((member) => member.school),
  );
  const editTargetSet = new Set(
    (log.group?.exam_target_schools ?? []).map((name) => name.trim()),
  );
  const examPreviewSchools =
    log.group?.exam_target_schools == null
      ? memberSchools
      : memberSchools.filter((school) => editTargetSet.has(school.trim()));
  const examPreviewEntries =
    log.group?.is_exam_period && examPreviewSchools.length > 0
      ? await getDailyLogExamPreviewEntries(examPreviewSchools, log.group?.grade, todayDateString())
      : [];

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          backHref={`/daily-logs/${log.id}`}
          title={log.status === "draft" ? "수업 일지 이어쓰기" : "수업 일지 수정"}
          description={`${formatKoreanDate(log.class_date, true)} · ${log.group?.name ?? "그룹 정보 없음"}`}
        />

        {/* 같은 날짜의 이전/다음 정규 수업 바로가기 — 클릭 시 공용 resolver로만 이동 (DB 무접촉) */}
        <AdjacentLessonNav
          previous={adjacentClasses.previous}
          next={adjacentClasses.next}
          date={log.class_date}
        />

        {/* 작성 중(draft) 일지는 새 작성 화면과 같은 그룹/날짜 피커를 유지한다 —
            draft로 자동 이동했더라도 반을 잘못 골랐다면 여기서 다시 바꿀 수 있다.
            제출하면 /daily-logs/new?groupId&date로 가서 공용 resolver가 그 identity의
            일지/draft를 찾아 이어쓰기 또는 새 폼을 연다 (조회만 — draft를 미리 만들지 않음).
            폼에 저장 안 된 변경이 있으면 기존 beforeunload 확인창이 이동을 막아준다.
            완료(completed)된 일지 수정에는 표시하지 않는다 (그룹 변경 불가 — 기존 정책). */}
        {log.status === "draft" ? (
          <Card className="mb-5">
            <CardContent className="py-4">
              <DailyLogPicker
                groups={allGroups.map((group) => ({ id: group.id, name: group.name }))}
                date={log.class_date}
                groupId={log.group_id}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* 이전 수업 기록 사이드바 — 새 작성 화면과 동일한 워크스페이스/데이터 재사용.
            표시 여부는 폼 모드(작성/이어쓰기/완료 수정)가 아니라 group+class_date 기준. */}
        <LessonHistoryWorkspace
          group={{ id: log.group_id, name: log.group?.name ?? "수업 그룹" }}
          currentDate={log.class_date}
          initialRows={history.rows}
          initialHasMore={history.hasMore}
          initialLoadFailed={history.failed}
          schedules={groupSchedules.map((slot) => ({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
          }))}
        >
        {/* 시험 기간 ON: 학교별 시험 대비 캘린더 미리보기 — 폼과 형제 트리 (remount 무관) */}
        {examPreviewEntries.length > 0 ? (
          <DailyLogExamPreview entries={examPreviewEntries} today={todayDateString()} />
        ) : null}

        <DailyLogForm
          dailyLogId={log.id}
          classDate={log.class_date}
          group={{ id: log.group_id, name: log.group?.name ?? "수업 그룹", grade: log.group?.grade }}
          students={sortedStudents}
          currentHomeworkStudents={currentMembers.filter((member) => !member.archived).map((member) => ({
            studentId: member.id, name: member.name, grade: member.grade, school: member.school,
          }))}
          scheduleDays={groupSchedules.map((slot) => slot.day_of_week)}
          // 수업 제목 옆 교재 LIST (제목 삽입 보조 — 저장된 제목을 자동 변경하지 않는다)
          textbooks={(log.group?.textbook ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)}
          draft={
            effectiveDraftRow
              ? {
                  id: effectiveDraftRow.id,
                  updatedAt: effectiveDraftRow.updated_at,
                  payload: effectiveDraftRow.payload,
                }
              : null
          }
          draftPromptOnly={Boolean(fallbackDraftRow)}
          // 오늘 숙제(구조화) — id 기반 sync를 위해 row id까지 전달
          initialAssignments={log.homeworkAssignments.map((hw) => ({
            id: hw.id,
            content: hw.content,
            dueDate: hw.due_date,
            textbook: hw.textbook ?? "",
            school: hw.school ?? "",
            // 저장된 대상(null=공통) 그대로 복원 — 그룹에서 빠진 학생이어도 공통으로 바꾸지 않는다
            assignedStudentId: hw.assigned_student_id ?? "",
            assignedStudentName: hw.assignedStudentName,
          }))}
          // 시험 기간 context — 새 항목의 기본 context 결정용 (기존 항목은 저장 필드 보존).
          // 학교 목록 source = 이 그룹 소속 학생들의 students.school (이미 조회한 멤버 재사용)
          examPeriod={log.group?.is_exam_period ?? false}
          schools={memberSchools}
          // PHASE 2 혼합 진도 — 그룹의 시험 대상 학교 설정 (null = legacy, 기존 방식 유지).
          // 기존 저장 항목은 저장 필드가 identity라 설정과 무관하게 그대로 hydrate/보존된다.
          examTargetSchools={log.group?.exam_target_schools ?? null}
          // [지난 수업에서 가져오기] — 직전 Finalized의 계획/숙제/할 일 (자동 적용 없음)
          importSource={importSource}
          // 학생 평가 카드 "지난 수업 참고" (read-only — 오늘 평가로 복사하지 않음)
          previousEvaluations={prevEvaluations}
          initial={{
            title: log.title ?? "",
            // migration 미적용 legacy row도 수업 내용을 잃지 않게 병합해 편집한다
            // (이미 병합된 row는 그대로 — 중복 없음).
            // 교재별 진도가 있는 일지는 default_progress가 "교재명 - 내용" mirror 합성이므로
            // mirror 부분을 떼고 "기타 메모"만 폼에 싣는다 (구조화는 textbookProgress로 복원).
            defaultProgress: stripDerivedPrefix(
              mergeLegacyLessonContent(log.default_progress, log.lesson_content),
              // mirror 순서: 교재 진도 → 학교 진도 (폼 합성과 동일 — 결정적 왕복)
              [
                buildTextbookSectionsText(log.textbook_progress ?? []),
                buildTextbookSectionsText(log.school_progress ?? []),
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
            memo: log.memo ?? "",
            homework: log.homework ?? "",
            homeworkDueDate: log.homework_due_date ?? "",
            nextLessonPlan: stripDerivedPrefix(
              log.next_lesson_plan ?? "",
              // mirror 순서: 교재 계획 → 학교 계획 (폼 합성과 동일 — 결정적 왕복)
              [
                buildTextbookSectionsText(log.textbook_plans ?? []),
                buildTextbookSectionsText(log.school_plans ?? []),
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
            nextPlanDate: log.next_plan_date ?? "",
            // 교재별 진도/계획 + 학교 진도/계획 스냅샷 복원 (저장된 context 우선 —
            // 현재 시험 기간 OFF여도 과거 학교 기록은 학교 편집기로 hydrate)
            textbookProgress: log.textbook_progress ?? [],
            textbookPlans: log.textbook_plans ?? [],
            schoolProgress: log.school_progress ?? [],
            schoolPlans: log.school_plans ?? [],
            // 해야 할 일 — 일지 row가 source (Todo 삭제/완료와 무관하게 폼 복원).
            // 다중 항목(tasks)이 있으면 그것, 없으면 legacy 단일 필드를 폼이 항목 1개로 변환
            tasks: log.tasks ?? undefined,
            taskContent: log.task_content ?? "",
            taskDate: log.task_due_date ?? "",
            taskTextbook: log.task_textbook ?? "",
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
        </LessonHistoryWorkspace>
      </main>
    </AppShell>
  );
}
