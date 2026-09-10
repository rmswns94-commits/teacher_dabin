import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleArrowRight, NotebookTabs } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { DailyLogForm } from "@/components/daily-log-form";
import { DailyLogPicker } from "@/components/daily-log-picker";
import { LessonHistoryWorkspace } from "@/components/lesson-history-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { sortByKoreanName } from "@/lib/korean-sort";
import { uniqueSchoolList } from "@/lib/textbooks";
import {
  getActiveDraftResumeTarget,
  getDailyLogDraft,
} from "@/lib/supabase/queries/daily-log-drafts";
import {
  getDailyLogByIdentity,
  getGroupHistoryLogs,
  getPreviousReflectionNext,
} from "@/lib/supabase/queries/daily-logs";
import {
  getCurrentUserGroups,
  getGroupLatestProgress,
  getGroupStudentsForCurrentUser,
} from "@/lib/supabase/queries/groups";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";

export default async function NewDailyLogPage({
  searchParams,
}: {
  searchParams?: Promise<{ groupId?: string; date?: string; resume?: string; fresh?: string }>;
}) {
  const params = (await searchParams) ?? {};

  // [수업 일지 작성하기] bare 진입(파라미터 없음): 작성 중인 draft가 있으면 그 화면으로.
  // 그룹/날짜를 명시한 진입(대시보드 hero·그룹 상세·캘린더 날짜·피커 제출)과
  // 폼의 그룹 "변경"(fresh=1)은 의도된 타겟이므로 그대로 새 작성 흐름을 탄다.
  // 모든 "수업 일지 작성하기" 버튼이 이 페이지를 가리키므로 여기 한 곳이 공용 정책이 된다.
  if (params.groupId === undefined && params.date === undefined && params.fresh === undefined) {
    const resumeHref = await getActiveDraftResumeTarget();
    if (resumeHref) {
      redirect(resumeHref);
    }
  }

  const requestedGroupId = params.groupId || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayDateString();

  // 특정 group(+date) 진입(오늘 수업 카드/그룹 상세/피커/직접 URL): 같은 canonical identity
  // (user+group+lesson_date)의 일지 row가 이미 있으면 그 수정 화면으로 — draft면 이어쓰기,
  // completed면 기존 기록 수정 (대시보드가 이미 쓰는 정책과 동일). "Today Draft"와
  // "수업일지 Draft"는 별개가 아니다: 어떤 버튼으로 들어와도 identity당 일지/Draft는 하나.
  if (requestedGroupId) {
    const existingLog = await getDailyLogByIdentity(requestedGroupId, date);
    if (existingLog) {
      redirect(`/daily-logs/${existingLog.id}/edit`);
    }
  }

  // 그룹 목록과 (선택된 그룹의) 학생/직전 수업/이전 기록을 한 번에 병렬 조회한다.
  // 이전 기록은 lightweight 첫 페이지만 — 실패해도 작성 화면은 그대로 동작해야 한다.
  const emptyHistory = { rows: [], hasMore: false, failed: false };
  const [groups, groupStudentsRaw, lastLesson, history, groupSchedules, draftRow, prevReflection] = await Promise.all([
    getCurrentUserGroups(),
    requestedGroupId ? getGroupStudentsForCurrentUser(requestedGroupId) : Promise.resolve([]),
    requestedGroupId ? getGroupLatestProgress(requestedGroupId) : Promise.resolve(null),
    requestedGroupId
      ? getGroupHistoryLogs(requestedGroupId, date, 0, 10)
          .then((result) => ({ ...result, failed: false }))
          .catch(() => ({ rows: [], hasMore: false, failed: true }))
      : Promise.resolve(emptyHistory),
    requestedGroupId ? getGroupSchedules(requestedGroupId) : Promise.resolve([]),
    // 같은 group+date의 자동 임시저장 draft (있으면 폼에서 복구 배너)
    requestedGroupId ? getDailyLogDraft({ groupId: requestedGroupId, classDate: date }) : Promise.resolve(null),
    // 직전 completed 일지의 "다음에 다르게 해볼 것" — 회고 카드의 지난 다짐 배너
    requestedGroupId ? getPreviousReflectionNext(requestedGroupId, date) : Promise.resolve(null),
  ]);

  const selectedGroup = requestedGroupId
    ? groups.find((group) => group.id === requestedGroupId)
    : undefined;
  // 학생 평가 목록은 항상 이름 가나다순 (membership 생성순이 아니라)
  // — 폼 로드 전에 정렬해 두므로 작성 중 재정렬/remount가 없다.
  const groupStudents = selectedGroup
    ? sortByKoreanName(
        groupStudentsRaw.filter((student) => !student.archived),
        (student) => student.name,
        (student) => student.id,
      )
    : [];

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          backHref="/daily-logs"
          title="오늘 수업 기록하기"
          description="반을 선택하면 소속 학생이 자동으로 표시돼요."
        />

        <Card className="mb-5">
          <CardContent className="py-4">
            <DailyLogPicker
              key={`${selectedGroup?.id ?? ""}:${date}`}
              groups={groups.map((group) => ({ id: group.id, name: group.name }))}
              date={date}
              groupId={selectedGroup?.id ?? ""}
            />
          </CardContent>
        </Card>

        <LessonHistoryWorkspace
          group={selectedGroup ? { id: selectedGroup.id, name: selectedGroup.name } : null}
          currentDate={date}
          initialRows={history.rows}
          initialHasMore={history.hasMore}
          initialLoadFailed={history.failed}
          schedules={groupSchedules.map((slot) => ({
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
          }))}
        >
        {!selectedGroup ? (
          groups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
                아직 만든 수업 그룹이 없어요. 먼저 수업 그룹을 만들어주세요.
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/groups">수업 그룹 만들기</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">
                위에서 수업 그룹을 선택하고 &quot;학생 불러오기&quot;를 눌러주세요.
              </CardContent>
            </Card>
          )
        ) : groupStudents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
              이 그룹에는 아직 소속된 학생이 없어요. 그룹에 학생을 먼저 추가해주세요.
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/groups/${selectedGroup.id}`}>그룹에서 학생 추가하기</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {lastLesson && (lastLesson.homework || lastLesson.next_lesson_plan) ? (
              <Card className="mb-5 border-[#e8ddf3] bg-[#fbf8ff]">
                <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
                      <NotebookTabs className="h-3.5 w-3.5" /> 지난 숙제 ({formatKoreanDate(lastLesson.class_date)})
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3d3450]">
                      {lastLesson.homework || "지난 숙제 기록이 없어요."}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
                      <CircleArrowRight className="h-3.5 w-3.5" /> 지난 시간에 적어둔 오늘 계획
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#33473f]">
                      {lastLesson.next_lesson_plan || "적어둔 계획이 없어요."}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <DailyLogForm
              // 상단 피커로 그룹/날짜를 바꾸면 soft navigation이라 client state가 남는다.
              // key로 remount를 강제해 이전 날짜/학생 목록의 stale state를 제거한다.
              key={`${selectedGroup.id}:${date}`}
              classDate={date}
              scheduleDays={groupSchedules.map((slot) => slot.day_of_week)}
              // 수업 제목 옆 교재 LIST — 이 그룹의 교재 목록 (그룹 상세와 같은 줄바꿈 포맷)
              textbooks={(selectedGroup.textbook ?? "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)}
              // 시험 기간 ON이면 숙제/다음 계획/해야 할 일이 학교 context를 쓴다.
              // 학교 목록 source = 이 그룹 소속 학생들의 students.school (추가 쿼리 0)
              examPeriod={selectedGroup.is_exam_period}
              schools={uniqueSchoolList(
                groupStudentsRaw.filter((student) => !student.archived).map((student) => student.school),
              )}
              draft={
                draftRow
                  ? { id: draftRow.id, updatedAt: draftRow.updated_at, payload: draftRow.payload }
                  : null
              }
              // group+date를 명시한 진입에서 같은 identity의 autosave draft가 있으면
              // 시간 창과 무관하게 즉시 전체 복원 — 어느 버튼으로 들어와도 같은 Draft 하나
              // (이 화면은 항상 group이 선택된 상태에서만 폼을 렌더하므로 = identity 확정)
              forceRestoreDraft={Boolean(draftRow)}
              group={{ id: selectedGroup.id, name: selectedGroup.name, grade: selectedGroup.grade }}
              students={groupStudents.map((student) => ({
                studentId: student.id,
                name: student.name,
                grade: student.grade,
                // 시험 기간 [전체 학생에게 적용]의 학교 매칭용 (학생 학교 = 적용 대상 기준)
                school: student.school,
              }))}
              previousReflection={
                prevReflection
                  ? {
                      classDate: prevReflection.class_date,
                      reflectionNext: prevReflection.reflection_next,
                    }
                  : null
              }
            />
          </>
        )}
        </LessonHistoryWorkspace>
      </main>
    </AppShell>
  );
}
