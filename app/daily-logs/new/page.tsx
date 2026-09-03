import Link from "next/link";
import { CircleArrowRight, NotebookTabs } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { DailyLogForm } from "@/components/daily-log-form";
import { DailyLogPicker } from "@/components/daily-log-picker";
import { LessonHistoryWorkspace } from "@/components/lesson-history-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { getDailyLogDraft } from "@/lib/supabase/queries/daily-log-drafts";
import { getGroupHistoryLogs } from "@/lib/supabase/queries/daily-logs";
import {
  getCurrentUserGroups,
  getGroupLatestProgress,
  getGroupStudentsForCurrentUser,
} from "@/lib/supabase/queries/groups";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";

export default async function NewDailyLogPage({
  searchParams,
}: {
  searchParams?: Promise<{ groupId?: string; date?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const requestedGroupId = params.groupId || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayDateString();

  // 그룹 목록과 (선택된 그룹의) 학생/직전 수업/이전 기록을 한 번에 병렬 조회한다.
  // 이전 기록은 lightweight 첫 페이지만 — 실패해도 작성 화면은 그대로 동작해야 한다.
  const emptyHistory = { rows: [], hasMore: false, failed: false };
  const [groups, groupStudentsRaw, lastLesson, history, groupSchedules, draftRow] = await Promise.all([
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
  ]);

  const selectedGroup = requestedGroupId
    ? groups.find((group) => group.id === requestedGroupId)
    : undefined;
  const groupStudents = selectedGroup
    ? groupStudentsRaw.filter((student) => !student.archived)
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
              draft={
                draftRow
                  ? { id: draftRow.id, updatedAt: draftRow.updated_at, payload: draftRow.payload }
                  : null
              }
              group={{ id: selectedGroup.id, name: selectedGroup.name, grade: selectedGroup.grade }}
              students={groupStudents.map((student) => ({
                studentId: student.id,
                name: student.name,
                grade: student.grade,
              }))}
            />
          </>
        )}
        </LessonHistoryWorkspace>
      </main>
    </AppShell>
  );
}
