import Link from "next/link";
import {
  BookOpenCheck,
  Check,
  CirclePlay,
  Clock3,
  ListTodo,
  NotebookPen,
  NotebookTabs,
  Plus,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Doodle, Tape } from "@/components/doodle";
import { EncouragementCard } from "@/components/encouragement-card";
import { NextClassCountdown } from "@/components/next-class-countdown";
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
  const prepProgress = prepItems.length > 0 ? Math.round((prepDone / prepItems.length) * 100) : 0;

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
        <div className="mx-auto w-full max-w-[1150px]">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-3">
              <div>
                <h1 className="font-display text-[26px] font-semibold leading-snug tracking-[-0.01em] text-[#2d2928] md:text-3xl">
                  안녕하세요,
                  <br />
                  {displayName} 선생님 <span aria-hidden>🌷</span>
                </h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-[#7b746f]">
                  오늘도 하나씩 준비해볼까요?
                  <Doodle kind="leaf" className="h-4 w-4 text-[#9dbfa8]" />
                </p>
              </div>
            </div>
            <Button className="gap-2" asChild>
              <Link href="/daily-logs/new">
                <NotebookPen className="h-4 w-4" />
                오늘 수업 기록하기
              </Link>
            </Button>
          </div>

          {stats.groups === 0 && stats.students === 0 ? (
            <div className="relative mb-5">
              <Tape />
            <Card className="border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] to-[#fdf9f4]">
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
                    <Link href="/groups">첫 수업 그룹 만들기</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            </div>
          ) : null}

          {slots.length === 0 ? (
            <Card className="rounded-[28px] border-[#e2d8f3] bg-gradient-to-br from-[#eeeafb] via-[#f8f4fd] to-[#fdfaf5]">
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#564d4d]">
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
            <div className="relative overflow-hidden rounded-[28px] border border-[#e2d8f3] bg-gradient-to-br from-[#eeeafb] via-[#f8f4fd] to-[#fdfaf5] shadow-[0_10px_30px_rgba(139,122,230,0.08)]">
              <div aria-hidden className="dot-pattern absolute inset-y-0 right-0 w-1/3 opacity-60" />
              <Doodle kind="sparkle" className="absolute bottom-16 right-9 h-5 w-5 text-[#d9cdf0] max-md:hidden" />

              <div className="relative p-6 md:p-7">
                {allDoneToday ? (
                  <div className="mb-3 inline-block rounded-full bg-white/75 px-3 py-1.5 text-sm text-[#3d6d58]">
                    오늘 수업은 모두 끝났어요 ✨
                  </div>
                ) : null}

                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7ae6]">
                  {isCurrentClass ? (
                    <>
                      <CirclePlay className="h-3.5 w-3.5" /> Current class
                    </>
                  ) : (
                    <>
                      <Clock3 className="h-3.5 w-3.5" /> Next class
                    </>
                  )}
                  <Doodle kind="sparkle" className="h-4 w-4 text-[#c5b6e3]" />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/groups/${hero.group.id}`}
                    className="text-2xl font-semibold tracking-[-0.02em] text-[#2d2928] hover:underline"
                  >
                    {hero.group.name}
                  </Link>
                  <NextClassCountdown startEpoch={hero.startEpoch} endEpoch={hero.endEpoch} />
                </div>

                <div className="mt-1.5 text-[15px] tabular-nums text-[#665b5a]">
                  {occurrenceDateLabel(hero)} · {formatTimeRange(hero.schedule.start_time, hero.schedule.end_time)}
                </div>

                <div className="mt-5">
                  {isCurrentClass ? (
                    <Button className="gap-2" asChild>
                      <Link
                        href={
                          heroTodayLog
                            ? `/daily-logs/${heroTodayLog.id}/edit`
                            : `/daily-logs/new?groupId=${hero.group.id}`
                        }
                      >
                        <NotebookPen className="h-4 w-4" /> 수업일지 열기 →
                      </Link>
                    </Button>
                  ) : (
                    <Button className="gap-2" asChild>
                      <Link href={`/groups/${hero.group.id}`}>
                        <ListTodo className="h-4 w-4" /> 수업 준비 열기 →
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Card className="rounded-[28px]">
              <CardContent className="p-6 text-sm text-[#655d5d]">
                다음 7일 안에 예정된 수업이 없어요. 수업 그룹에서 시간을 확인해주세요.
              </CardContent>
            </Card>
          )}

          {showEndedNudge && lastEnded ? (
            <Card className="mt-4">
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

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
            <div className="space-y-4">
              {focusGroup ? (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2">
                        <ListTodo className="h-4 w-4 text-[#3e7d6b]" /> To do list
                        <span className="text-sm font-normal text-[#8a7b77]">· {focusGroup.name}</span>
                      </CardTitle>
                      {prepItems.length > 0 ? (
                        <span className="text-xs tabular-nums text-[#8a7b77]">
                          {prepDone} / {prepItems.length}
                        </span>
                      ) : null}
                    </div>
                    {prepItems.length > 0 ? (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#f0eae4]">
                        <div
                          className="h-full rounded-full bg-[#b3a5ec] transition-all duration-300"
                          style={{ width: `${prepProgress}%` }}
                        />
                      </div>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {prepItems.length === 0 ? (
                      <div className="rounded-2xl bg-[#faf5f0] p-3 text-sm text-[#655d5d]">
                        지금 준비할 항목이 없어요 🍃
                      </div>
                    ) : (
                      <ul className="divide-y divide-dashed divide-[#f4e2e8]">
                        {prepItems.map((item) => (
                          <li key={item.id}>
                            <form action={togglePreparationItemAction.bind(null, focusGroup.id, item.id)}>
                              <button
                                type="submit"
                                aria-pressed={item.completed}
                                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f2edf9]"
                              >
                                {item.completed ? (
                                  <span
                                    aria-hidden
                                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#8fc7ab]"
                                  >
                                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                  </span>
                                ) : (
                                  <span
                                    aria-hidden
                                    className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[#d9c8f0] bg-white"
                                  />
                                )}
                                <span
                                  className={
                                    item.completed
                                      ? "text-[#8a7b77] [text-decoration:line-through] opacity-70"
                                      : "text-[#2d2928]"
                                  }
                                >
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
                        placeholder="수업 전에 챙길 일을 적어보세요"
                        className="flex-1 rounded-xl border border-[#ece0db] bg-[#fdfaf6] px-3 py-2 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
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
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Today class</CardTitle>
                    {overview.todayLogs.length > 0 ? (
                      <span className="text-xs tabular-nums text-[#8a7b77]">{overview.todayLogs.length}개</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {overview.todayLogs.length === 0 ? (
                    <div className="rounded-2xl bg-[#faf5f0] p-4 text-sm text-[#655d5d]">
                      아직 오늘 작성한 수업일지가 없어요 ☁️
                    </div>
                  ) : (
                    overview.todayLogs.map((log) => (
                      <Link key={log.id} href={`/daily-logs/${log.id}`} className="block">
                        <div className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#f2edf9]">
                          <span
                            aria-hidden
                            className={
                              log.status === "completed"
                                ? "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#8fc7ab]"
                                : "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#c9bce8] bg-white"
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-[#2d2928]">{log.group?.name ?? "수업"}</span>
                              <DailyLogStatusBadge status={log.status} />
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs">
                              <span className="rounded-full bg-[#e4f4ec] px-2 py-0.5 tabular-nums text-[#3d7f64]">
                                출석 {log.attendanceCounts.present}
                              </span>
                              {log.attendanceCounts.absent > 0 ? (
                                <span className="rounded-full bg-[#f9e7e5] px-2 py-0.5 tabular-nums text-[#a26660]">
                                  결석 {log.attendanceCounts.absent}
                                </span>
                              ) : null}
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
                  <CardHeader className="pb-2">
                    <CardTitle>밀린 일</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {backlog.map((item) => (
                      <Link key={item.key} href={item.href} className="block">
                        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 transition hover:bg-[#f2edf9]">
                          <span className="text-sm text-[#2d2928]">{item.title}</span>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${item.badgeClass}`}>
                            {item.badge}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {followUp ? (
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a8968f]">
                        그 다음
                      </span>
                      <Link href={`/groups/${followUp.group.id}`} className="font-medium text-[#2b2323] hover:underline">
                        {followUp.group.name}
                      </Link>
                    </div>
                    <span className="tabular-nums text-[#665b5a]">
                      {occurrenceDateLabel(followUp)} · {formatTimeRange(followUp.schedule.start_time, followUp.schedule.end_time)}
                    </span>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          <div className="mt-6 pb-8">
            <EncouragementCard />
          </div>
        </div>
      </main>
    </AppShell>
  );
}
