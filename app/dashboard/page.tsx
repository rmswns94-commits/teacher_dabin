import Link from "next/link";
import {
  BookOpenCheck,
  CalendarDays,
  CirclePlay,
  Clock3,
  ListTodo,
  NotebookPen,
  NotebookTabs,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Doodle, Tape } from "@/components/doodle";
import { EncouragementCard } from "@/components/encouragement-card";
import { NextClassCountdown } from "@/components/next-class-countdown";
import { DailyLogStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { DashboardTodoCard } from "@/components/dashboard-todo-card";
import { activePreparationItems, isCompletedToday } from "@/lib/preparation";
import { currentEpochMs } from "@/lib/todo-window";
import { getUpcomingExamEvents } from "@/lib/supabase/queries/calendar-events";
import { DAY_LABELS, formatTimeRange, getScheduleOverview, type ClassOccurrence } from "@/lib/schedule";
import { getDisplayName } from "@/lib/supabase/auth";
import { getDashboardOverview, getDashboardStats } from "@/lib/supabase/queries/dashboard";
import { getCurrentUserGroups, getGroupLatestProgress } from "@/lib/supabase/queries/groups";
import type { PreparationItem } from "@/lib/supabase/types";
import { getCurrentUserSchedulesWithGroup, type ScheduleGroupInfo } from "@/lib/supabase/queries/schedules";
import { getServerUser } from "@/lib/supabase/server";

// 시험 D-day 노출 윈도우 (오늘 포함 D-30까지 — 시험 안내 전용, To Do와 무관)
const EXAM_DISPLAY_DAYS = 30;

// 시험 일정 제목에서 학교 이름 추출 (예: "문경중학교 기말시험" → 문경중학교, "한울중 시험" → 한울중).
// 확신할 수 없으면 null을 돌려주고 카드에는 일정 제목을 그대로 쓴다 — 이름을 지어내지 않는다.
function extractSchoolName(title: string) {
  const tokens = title.split(/[\s·,\-()[\]/]+/).filter(Boolean);

  const fullName = tokens.find((token) => /(초등학교|중학교|고등학교|학교)$/.test(token));
  if (fullName) {
    return fullName;
  }

  // "문경중" · "가산고" 같은 축약 표기 (시험/고사 단어 자체는 제외)
  return (
    tokens.find(
      (token) =>
        token.length >= 2 &&
        !token.includes("시험") &&
        !token.includes("고사") &&
        /^[가-힣]+(초|중|고)$/.test(token),
    ) ?? null
  );
}

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
  const today = todayDateString();
  const [stats, overview, schedules, examEvents, allGroups] = await Promise.all([
    getDashboardStats(),
    getDashboardOverview(),
    getCurrentUserSchedulesWithGroup(),
    // '시험' 일정은 D-day 30일 전부터 카드로 보여준다 (진행 중 포함)
    getUpcomingExamEvents(today, addDaysStr(today, EXAM_DISPLAY_DAYS)),
    // 다음 수업 계획 To Do(전체 그룹의 dated 준비 항목) 계산용 — group/icon batch, N+1 없음
    getCurrentUserGroups(),
  ]);
  const displayName = getDisplayName(user);

  const upcomingExams = examEvents.map((event) => {
    const inPeriod = event.start_date <= today && today <= event.end_date;
    const dday = Math.round(
      (Date.parse(`${event.start_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
    );

    return {
      id: event.id,
      school: extractSchoolName(event.title),
      title: event.title,
      groupName: event.group?.name ?? null,
      dateLabel:
        event.end_date > event.start_date
          ? `${formatKoreanDate(event.start_date, true)} ~ ${formatKoreanDate(event.end_date)}`
          : formatKoreanDate(event.start_date, true),
      badge: inPeriod ? "시험 기간 중" : dday === 0 ? "D-DAY" : `D-${dday}`,
      inPeriod,
    };
  });

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
  const latestProgress = focusGroup ? await getGroupLatestProgress(focusGroup.id) : null;

  // To do list는 read-only summary: 수업 그룹 상세에서 Teacher가 실제 등록한
  // preparation_items만 보여준다 (Dashboard 직접 입력/추천 생성 없음).
  // 수동 체크리스트만 (날짜 있는 다음 수업 계획 항목은 아래 섹션에서 due 날짜에 노출)
  const prepItems = activePreparationItems(focusGroup?.preparation_items).filter(
    (item) => !item.dueDate,
  );

  // 그룹별 오늘 수업 window — schedules를 이미 갖고 있어 추가 쿼리 없음 (N+1 금지).
  // 하루 여러 slot이면 [가장 이른 시작, 가장 늦은 종료) 합집합을 쓴다.
  const todayDow = dayOfWeekOf(today);
  const todayWindowByGroup = new Map<string, { start: string; end: string }>();
  for (const row of schedules) {
    if (row.day_of_week !== todayDow) {
      continue;
    }
    const current = todayWindowByGroup.get(row.group_id);
    todayWindowByGroup.set(row.group_id, {
      start: !current || row.start_time < current.start ? row.start_time : current.start,
      end: !current || row.end_time > current.end ? row.end_time : current.end,
    });
  }

  // 날짜 있는 To Do(다음 수업 계획 연동 + 직접 등록 dated 항목): due가 "오늘"인 것만 후보로 (노출 시각은 client에서
  // 수업 window 기준 판단 — 수업 종료 후엔 숨기고, DB row는 그대로 둔다).
  // 시험 일정과는 무관 (source = daily_log_next_plan 항목만).
  const duePlanItems = allGroups
    .flatMap((planGroup) =>
      (activePreparationItems(planGroup.preparation_items) as PreparationItem[])
        .filter(
          (item) =>
            Boolean(item.dueDate) &&
            item.dueDate === today &&
            // 완료된 항목은 오늘(KST) 완료한 것만 취소선으로 유지 (legacy 완료 이력 제외)
            (!item.completed || isCompletedToday(item, today)),
        )
        .map((item) => ({ planGroup, item })),
    )
    .sort((a, b) => {
      const windowA = todayWindowByGroup.get(a.planGroup.id)?.start ?? "99:99";
      const windowB = todayWindowByGroup.get(b.planGroup.id)?.start ?? "99:99";
      return windowA.localeCompare(windowB);
    });

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

                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  {/* 오늘 날짜 — 카드 우측 상단 */}
                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium tabular-nums text-[#6d5aa8]">
                    {formatKoreanDate(today)} ({DAY_LABELS[dayOfWeekOf(today)]})
                  </span>
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
              {/* To do list — 수업 시간 기반 노출 (client에서 시간만 갱신, DB polling 없음) */}
              <DashboardTodoCard
                focusGroup={focusGroup ? { id: focusGroup.id, name: focusGroup.name } : null}
                checklistItems={prepItems.map((item) => ({
                  id: item.id,
                  text: item.text,
                  completed: item.completed,
                }))}
                checklistWindow={focusGroup ? (todayWindowByGroup.get(focusGroup.id) ?? null) : null}
                planItems={duePlanItems.map(({ planGroup, item }) => ({
                  groupId: planGroup.id,
                  groupName: planGroup.name,
                  groupIcon: planGroup.icon ?? null,
                  id: item.id,
                  text: item.text,
                  completed: item.completed,
                  dueDate: item.dueDate!,
                  window: todayWindowByGroup.get(planGroup.id) ?? null,
                }))}
                initialNow={currentEpochMs()}
              />

              {/* '시험' 일정 D-day 카드 — 30일 전부터, 일정 없으면 카드 숨김 */}
              {upcomingExams.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-[#a05a7c]" /> 다가오는 시험
                      <span className="text-sm font-normal text-[#8a7b77]">
                        · {upcomingExams.length}건
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {upcomingExams.map((exam) => (
                      <div
                        key={exam.id}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-[#fdfaf8] px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-[#2b2323]">
                              {exam.school ?? exam.title}
                            </span>
                            {exam.school ? (
                              <span className="text-xs text-[#8a7b77]">{exam.title}</span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs tabular-nums text-[#8a7b77]">
                            {exam.dateLabel}
                            {exam.groupName ? ` · ${exam.groupName}` : ""}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                            exam.inPeriod
                              ? "bg-[#fbeef3] text-[#a05a7c]"
                              : "bg-[#efe8fb] text-[#5d4ba5]"
                          }`}
                        >
                          {exam.badge}
                        </span>
                      </div>
                    ))}
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
