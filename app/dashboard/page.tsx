import Link from "next/link";
import {
  BookOpenCheck,
  CirclePlay,
  Clock3,
  ListTodo,
  NotebookPen,
  NotebookTabs,
  Plus,
  Square,
  SquareCheck,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Doodle } from "@/components/doodle";
import { EncouragementCard } from "@/components/encouragement-card";
import { NextClassCountdown } from "@/components/next-class-countdown";
import { PageHeader } from "@/components/page-header";
import { PendingButton } from "@/components/pending-button";
import { DailyLogStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addPreparationItemAction, togglePreparationItemAction } from "@/app/groups/actions";
import { formatKoreanDate } from "@/lib/dates";
import { formatTimeRange, getScheduleOverview, type ClassOccurrence } from "@/lib/schedule";
import { getDisplayName } from "@/lib/supabase/auth";
import { getDashboardOverview, getDashboardStats } from "@/lib/supabase/queries/dashboard";
import { getGroupLatestProgress, getGroupStudentsForCurrentUser } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup, type ScheduleGroupInfo } from "@/lib/supabase/queries/schedules";
import { getServerUser } from "@/lib/supabase/server";

function occurrenceDateLabel(occ: ClassOccurrence<ScheduleGroupInfo>) {
  if (occ.daysFromNow === 0) {
    return "오늘";
  }

  if (occ.daysFromNow === 1) {
    return "내일";
  }

  return formatKoreanDate(occ.date, true);
}

export default async function DashboardPage() {
  const user = await getServerUser();
  const [stats, overview, schedules] = await Promise.all([
    getDashboardStats(),
    getDashboardOverview(),
    getCurrentUserSchedulesWithGroup(),
  ]);
  const displayName = getDisplayName(user);

  const slots = schedules
    .filter((row) => row.group)
    .map((row) => ({ schedule: row, group: row.group! }));
  const scheduleOverview = getScheduleOverview(slots);
  const hero = scheduleOverview.current ?? scheduleOverview.next;
  const followUp = scheduleOverview.current ? scheduleOverview.next : scheduleOverview.nextAfter;
  const isCurrentClass = Boolean(scheduleOverview.current);
  const allDoneToday =
    !scheduleOverview.current &&
    scheduleOverview.endedToday.length > 0 &&
    (!scheduleOverview.next || scheduleOverview.next.daysFromNow > 0);

  const focusGroup = hero?.group ?? null;
  const [latestProgress, focusMembers] = focusGroup
    ? await Promise.all([
        getGroupLatestProgress(focusGroup.id),
        getGroupStudentsForCurrentUser(focusGroup.id),
      ])
    : [null, []];

  const prepItems = focusGroup?.preparation_items ?? [];
  const prepDone = prepItems.filter((item) => item.completed).length;

  const focusMemberIds = new Set(focusMembers.filter((s) => !s.archived).map((s) => s.id));
  const hasOpenMakeupInFocusGroup = overview.openMakeups.some(
    (makeup) => makeup.student && focusMemberIds.has(makeup.student.id),
  );
  const suggestions = focusGroup
    ? [
        latestProgress?.homework ? "지난 숙제 확인" : null,
        latestProgress?.next_lesson_plan ? "다음 수업 계획 확인" : null,
        hasOpenMakeupInFocusGroup ? "보충학생 확인" : null,
      ].filter(
        (text): text is string =>
          Boolean(text) && !prepItems.some((item) => item.text === text),
      )
    : [];

  const heroTodayLog = hero
    ? overview.todayLogs.find((log) => log.group_id === hero.group.id)
    : undefined;

  // A class finished today but its log isn't completed yet → nudge to write it.
  const lastEnded = scheduleOverview.endedToday.at(-1) ?? null;
  const endedGroupLog = lastEnded
    ? overview.todayLogs.find((log) => log.group_id === lastEnded.group.id)
    : undefined;
  const showEndedNudge = Boolean(lastEnded && endedGroupLog?.status !== "completed");

  const draftToday = overview.todayLogs.filter((log) => log.status === "draft");
  const todayMakeups = overview.openMakeups.filter((makeup) => makeup.scheduled_date === overview.today);
  const unscheduledMakeups = overview.openMakeups.filter((makeup) => makeup.status === "required");

  const backlog = [
    ...draftToday.map((log) => ({
      key: `draft-${log.id}`,
      href: `/daily-logs/${log.id}/edit`,
      title: `${log.group?.name ?? "수업"} 일지 마저 작성하기`,
      badge: "작성 중",
      badgeClass: "bg-[#fdf3e4] text-[#94702f]",
    })),
    ...todayMakeups.map((makeup) => ({
      key: `today-${makeup.id}`,
      href: "/makeups",
      title: `${makeup.student?.name ?? "학생"} 보충수업 (오늘 예정)`,
      badge: "오늘",
      badgeClass: "bg-[#eaf3f0] text-[#3d7c68]",
    })),
    ...unscheduledMakeups.map((makeup) => ({
      key: `required-${makeup.id}`,
      href: "/makeups",
      title: `${makeup.student?.name ?? "학생"} 보충 일정 정하기`,
      badge: "대기",
      badgeClass: "bg-[#fff1ee] text-[#a86a5d]",
    })),
  ];

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title={`안녕하세요, ${displayName} 선생님 🌷`}
          description="다음 수업과 준비할 일을 한눈에 확인해보세요."
          action={
            <Button className="gap-2" asChild>
              <Link href="/daily-logs/new">
                <NotebookPen className="h-4 w-4" />
                오늘 수업 기록하기
              </Link>
            </Button>
          }
        />

        {stats.groups === 0 && stats.students === 0 ? (
          <Card className="mb-5 border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] to-[#fdf9f4]">
            <CardContent className="p-5">
              <div className="font-display text-lg font-semibold text-[#2a2323]">환영해요 🌷</div>
              <p className="mt-2 text-sm leading-6 text-[#564d4d]">
                먼저 수업 그룹을 만들면 나머지가 자연스럽게 이어져요.
              </p>
              <ol className="mt-3 space-y-1 text-sm text-[#655d5d]">
                <li>① 수업 그룹 만들기 (요일·시간·교재까지 한 번에)</li>
                <li>② 학생 등록하고 그룹에 추가하기</li>
                <li>③ 오늘 수업 기록하기</li>
              </ol>
              <div className="mt-4">
                <Button className="gap-2" asChild>
                  <Link href="/groups#new-group">첫 수업 그룹 만들기</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {slots.length === 0 ? (
              <Card className="border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] to-[#fdf9f4]">
                <CardContent className="flex flex-col items-start gap-3 p-5 text-sm text-[#564d4d]">
                  <div className="flex items-center gap-2 font-medium text-[#3d3450]">
                    <Clock3 className="h-4 w-4 text-[#6852b8]" /> 아직 등록된 수업 시간이 없어요.
                  </div>
                  수업 그룹에서 시간을 등록하면 다음 수업을 자동으로 알려드려요.
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/groups">수업 그룹 설정</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : hero ? (
              <Card className="border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] to-[#fdf9f4]">
                <CardContent className="p-5">
                  {allDoneToday ? (
                    <div className="mb-3 rounded-2xl bg-white/70 px-3 py-2 text-sm text-[#3d6d58]">
                      오늘 수업은 모두 끝났어요 ✨
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
                      {isCurrentClass ? (
                        <>
                          <CirclePlay className="h-3.5 w-3.5" /> 현재 수업
                        </>
                      ) : (
                        <>
                          <Clock3 className="h-3.5 w-3.5" /> 다음 수업
                        </>
                      )}
                    </div>
                    <Doodle kind="sparkle" className="h-5 w-5 text-[#c5b6e3]" />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/groups/${hero.group.id}`}
                      className="text-xl font-semibold text-[#2a2323] hover:underline"
                    >
                      {hero.group.name}
                    </Link>
                    <NextClassCountdown startEpoch={hero.startEpoch} endEpoch={hero.endEpoch} />
                  </div>

                  <div className="mt-1 text-sm text-[#665b5a]">
                    {occurrenceDateLabel(hero)} · {formatTimeRange(hero.schedule.start_time, hero.schedule.end_time)}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isCurrentClass ? (
                      <Button className="gap-2" asChild>
                        <Link
                          href={
                            heroTodayLog
                              ? `/daily-logs/${heroTodayLog.id}/edit`
                              : `/daily-logs/new?groupId=${hero.group.id}`
                          }
                        >
                          <NotebookPen className="h-4 w-4" /> 수업일지 열기
                        </Link>
                      </Button>
                    ) : (
                      <Button className="gap-2" asChild>
                        <Link href={`/groups/${hero.group.id}`}>
                          <ListTodo className="h-4 w-4" /> 수업 준비 열기
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-5 text-sm text-[#655d5d]">
                  다음 7일 안에 예정된 수업이 없어요. 수업 그룹에서 시간을 확인해주세요.
                </CardContent>
              </Card>
            )}

            {showEndedNudge && lastEnded ? (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-[#564d4d]">
                    <strong className="text-[#2b2323]">{lastEnded.group.name}</strong> 수업이 끝났어요.
                  </span>
                  <Button variant="secondary" size="sm" className="gap-1.5" asChild>
                    <Link
                      href={
                        endedGroupLog
                          ? `/daily-logs/${endedGroupLog.id}/edit`
                          : `/daily-logs/new?groupId=${lastEnded.group.id}`
                      }
                    >
                      <NotebookPen className="h-3.5 w-3.5" /> 수업일지 작성하기
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {focusGroup ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <ListTodo className="h-4 w-4 text-[#3e7d6b]" /> 지금 할 일
                      <span className="text-sm font-normal text-[#8a7b77]">· {focusGroup.name}</span>
                    </CardTitle>
                    {prepItems.length > 0 ? (
                      <span className="text-xs text-[#8a7b77]">
                        {prepDone} / {prepItems.length}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {prepItems.length === 0 ? (
                    <div className="rounded-2xl bg-[#f8f3ef] p-3 text-sm text-[#655d5d]">
                      지금 준비할 항목이 없어요.
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {prepItems.map((item) => (
                        <li key={item.id}>
                          <form action={togglePreparationItemAction.bind(null, focusGroup.id, item.id)}>
                            <button
                              type="submit"
                              aria-pressed={item.completed}
                              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition hover:bg-[#f8f3f0]"
                            >
                              {item.completed ? (
                                <SquareCheck className="h-4 w-4 shrink-0 text-[#3d7f64]" />
                              ) : (
                                <Square className="h-4 w-4 shrink-0 text-[#a79996]" />
                              )}
                              <span className={item.completed ? "text-[#7c6d69] line-through opacity-60" : "text-[#2b2323]"}>
                                {item.text}
                              </span>
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  {suggestions.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[#8a7b77]">추천:</span>
                      {suggestions.map((text) => (
                        <form key={text} action={addPreparationItemAction.bind(null, focusGroup.id)}>
                          <input type="hidden" name="text" value={text} />
                          <button
                            type="submit"
                            className="rounded-full border border-[#d8ebe0] bg-white px-2.5 py-1 text-xs text-[#3d6d58] transition hover:bg-[#f0faf5]"
                          >
                            + {text}
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : null}

                  <form action={addPreparationItemAction.bind(null, focusGroup.id)} className="flex gap-2">
                    <input
                      name="text"
                      maxLength={100}
                      placeholder="할 일 추가"
                      className="flex-1 rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                      required
                    />
                    <PendingButton variant="secondary" size="sm" pendingText="추가 중..." className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> 추가
                    </PendingButton>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {focusGroup && (latestProgress?.next_lesson_plan || latestProgress?.homework) ? (
              <Card>
                <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
                      <BookOpenCheck className="h-3.5 w-3.5" /> 오늘 수업 계획
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#33473f]">
                      {latestProgress?.next_lesson_plan || (
                        <span className="text-[#9a8db5]">적어둔 계획이 없어요.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
                      <NotebookTabs className="h-3.5 w-3.5" /> 지난 숙제
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3d3450]">
                      {latestProgress?.homework || (
                        <span className="text-[#9a8db5]">지난 숙제 기록이 없어요.</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {followUp ? (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7b77]">그 다음</span>
                    <Link href={`/groups/${followUp.group.id}`} className="font-medium text-[#2b2323] hover:underline">
                      {followUp.group.name}
                    </Link>
                  </div>
                  <span className="text-[#665b5a]">
                    {occurrenceDateLabel(followUp)} · {formatTimeRange(followUp.schedule.start_time, followUp.schedule.end_time)}
                  </span>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>오늘 수업</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.todayLogs.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                    아직 오늘 작성한 수업일지가 없어요.
                  </div>
                ) : (
                  overview.todayLogs.map((log) => (
                    <Link key={log.id} href={`/daily-logs/${log.id}`} className="block">
                      <div className="rounded-2xl border border-[#f0e7e2] bg-[#fdfaf8] p-3 transition hover:bg-[#f8f3f0]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#2b2323]">{log.group?.name ?? "수업"}</span>
                            <DailyLogStatusBadge status={log.status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="rounded-full bg-[#edf9f3] px-2 py-0.5 text-[#3d7f64]">
                              출석 {log.attendanceCounts.present}
                            </span>
                            <span className="rounded-full bg-[#fff0ef] px-2 py-0.5 text-[#a26660]">
                              결석 {log.attendanceCounts.absent}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {backlog.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>밀린 일</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {backlog.map((item) => (
                    <Link key={item.key} href={item.href} className="block">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#f0e7e2] bg-[#fdfaf8] p-3 transition hover:bg-[#f8f3f0]">
                        <span className="text-sm text-[#2b2323]">{item.title}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${item.badgeClass}`}>
                          {item.badge}
                        </span>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <EncouragementCard />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
