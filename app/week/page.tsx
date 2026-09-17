import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { formatHomeworkDisplay, homeworkAudienceLabel } from "@/lib/homework-assignments";
import { activePreparationItems } from "@/lib/preparation";
import type { PreparationItem } from "@/lib/supabase/types";
import { DAY_LABELS } from "@/lib/schedule";
import { getKstWeekRange, groupByDueDate } from "@/lib/week";
import { linkedContextLabel } from "@/lib/textbooks";
import { WeekTodayButton } from "@/components/week-today-button";
import { getUpcomingExamEvents } from "@/lib/supabase/queries/calendar-events";
import { getDueHomeworkForCurrentUser } from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getScheduledMakeupsInRange } from "@/lib/supabase/queries/makeups";
import { dayOfWeekOf } from "@/lib/calendar";

// 이번 주 일정 — 기존 데이터(보충/시험/숙제/할 일)의 READ-ONLY weekly projection.
// 여기서 어떤 일정도 생성/수정하지 않는다: 각 item은 실제 담당 화면으로 이동하는 링크일 뿐이다.
// - 정규 수업 리스트는 이 화면에 표시하지 않는다 (사용자 요청으로 제거 — UI만 제거이며
//   Group schedule/일지/완료 데이터는 그대로다. 시간표는 Group 상세, 현재/다음 수업은
//   대시보드가 담당). 정규 수업 전용이던 schedule/Finalized-key 조회도 함께 제거했다.
// - 주간 범위: Asia/Seoul 월~일 (getKstWeekRange — 일요일도 그 주 월요일로).
// - 보충: 실제 scheduled_date만 (일정 미정 보충 제외, completed는 그 자리에서 완료 표시,
//   cancelled는 조회 자체에서 제외 — 완료로 표시되지 않는다).
// - [오늘로 이동]: 현재 주면 오늘 섹션으로 scroll, 다른 주면 현재 주 전환 후 1회 scroll
//   (버튼 클릭 시에만, 반복 auto-scroll 없음).
// - 시험: calendar_events의 실제 시험 날짜 범위와 겹치는 날에 표시.
// - 숙제/할 일: "원래 due_date"에만 — 오늘 할 일의 carry-forward(이월)는 실행 관점의
//   다른 의미라 주간 화면에 복제하지 않는다. undated 항목은 날짜를 추측하지 않고 제외.
// - 쿼리: source별 주간 range 1회씩 병렬 (날짜별 7쿼리/항목별 N+1 없음), 페이지는 dynamic이라
//   다른 화면에서 완료/변경 후 이동하면 항상 최신이다 (polling/Realtime 없음).

export default async function WeekPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  const week = getKstWeekRange(base);

  // 서로 독립인 source들 — 병렬 fetch (waterfall 금지)
  const [allGroups, makeups, examEvents, homework] = await Promise.all([
    // 그룹 이름(숙제 표시)/할 일(preparation_items) — 이미 있는 목록 쿼리 1개
    getCurrentUserGroups(),
    getScheduledMakeupsInRange(week.start, week.end),
    // 실제 시험 일정 (기존 range query 재사용 — 주와 겹치는 시험)
    getUpcomingExamEvents(week.start, week.end),
    // 원래 due_date 기준 range — carryForwardToday를 넘기지 않으므로 이월 중복이 구조적으로 없다
    getDueHomeworkForCurrentUser({ rangeStart: week.start, rangeEnd: week.end }),
  ]);

  const groupNameById = new Map(allGroups.map((group) => [group.id, group.name]));

  const makeupsByDate = groupByDueDate(makeups, (item) => item.scheduledDate, week.days);
  const homeworkByDate = groupByDueDate(homework, (item) => item.dueDate, week.days);

  // 할 일 — 그룹 preparation_items의 dueDate 항목 (dismissed 제외, 완료는 표시 유지)
  const todoRows = allGroups.flatMap((group) =>
    (activePreparationItems(group.preparation_items) as PreparationItem[])
      .filter((item) => Boolean(item.dueDate))
      .map((item) => ({ group, item })),
  );
  const todosByDate = groupByDueDate(todoRows, (row) => row.item.dueDate, week.days);

  // 시험은 기간(시작~종료)과 겹치는 각 날짜에 표시 — 시험 기간을 주간에서 그대로 본다
  const examsByDate = new Map<string, typeof examEvents>();
  for (const date of week.days) {
    const items = examEvents.filter(
      (event) => event.start_date <= date && date <= event.end_date,
    );
    if (items.length > 0) {
      examsByDate.set(date, items);
    }
  }

  const isCurrentWeek = week.days.includes(today);
  const weekTotal =
    makeups.length +
    homework.length +
    todoRows.filter((row) => week.days.includes(row.item.dueDate!)).length +
    [...examsByDate.values()].reduce((n, v) => n + v.length, 0);

  const typeBadge = (label: string, className: string) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <PageHeader
            backHref="/dashboard"
            title="주간 일정"
            description="이번 주의 보충 · 시험 · 숙제 · 할 일을 한눈에 볼 수 있어요."
          />

          {/* 주간 이동 — URL(?date=)이 상태라 새로고침/뒤로가기/링크 공유에도 유지된다 */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" size="sm" className="gap-1" asChild>
              <Link href={`/week?date=${addDaysStr(week.start, -7)}`}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> 이전 주
              </Link>
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="card-title tabular-nums text-[#2a2323]">
                {formatKoreanDate(week.start)} ~ {formatKoreanDate(week.end)}
              </span>
              <WeekTodayButton isCurrentWeek={isCurrentWeek} today={today} />
            </div>
            <Button variant="secondary" size="sm" className="gap-1" asChild>
              <Link href={`/week?date=${addDaysStr(week.start, 7)}`}>
                다음 주 <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>

          {weekTotal === 0 ? (
            <Card>
              <CardContent className="secondary-text flex items-center gap-2 p-6 text-[#7f6f68]">
                <CalendarDays className="h-4 w-4 text-[#9b8bc9]" aria-hidden /> 이번 주 일정이
                없어요.
              </CardContent>
            </Card>
          ) : null}

          {/* 넓은 화면 7-column, 좁은 화면은 요일별 vertical sections (viewport 기준 — sniffing 없음) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
            {week.days.map((date) => {
              const dayMakeups = makeupsByDate.get(date) ?? [];
              const dayExams = examsByDate.get(date) ?? [];
              const dayHomework = homeworkByDate.get(date) ?? [];
              const dayTodos = todosByDate.get(date) ?? [];
              const isToday = date === today;
              const dated = dayExams.length + dayHomework.length + dayTodos.length;
              const empty = dayMakeups.length + dated === 0;

              return (
                <section
                  key={date}
                  id={`week-day-${date}`}
                  className={`min-w-0 scroll-mt-4 rounded-2xl border p-3 ${
                    isToday ? "border-[#d8cdf0] bg-[#f8f5ff]" : "border-[#efe4dc] bg-[#fffdfb]"
                  }`}
                >
                  <h2 className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-semibold text-[#2d2928]">
                      {DAY_LABELS[dayOfWeekOf(date)]}{" "}
                      <span className="tabular-nums">{Number(date.slice(8, 10))}일</span>
                    </span>
                    <span className="caption-text text-[#a79996]">{date.slice(5, 7)}월</span>
                    {isToday ? (
                      <span className="shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]">
                        오늘
                      </span>
                    ) : null}
                  </h2>

                  {empty ? (
                    <p className="caption-text mt-2 text-[#b5a9a4]">일정 없음</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {/* 시간 일정 — 보충만, 시작 시간 ASC (시간 없는 보충은 뒤로).
                          정규 수업 리스트는 이 화면에서 표시하지 않는다 (Group 상세/대시보드 담당). */}
                      {[
                        ...dayMakeups.map((makeup) => ({
                          time: makeup.startTime ?? "99:99",
                          node: (
                            <Link
                              key={`m-${makeup.id}`}
                              href="/makeups"
                              className="block min-w-0 rounded-xl border border-[#efe4dc] bg-white px-2.5 py-2 transition hover:bg-[#fdf7f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e0b28c]"
                            >
                              {makeup.startTime ? (
                                <div className="caption-text tabular-nums text-[#7f6f68]">
                                  {makeup.startTime}
                                  {makeup.endTime ? ` ~ ${makeup.endTime}` : ""}
                                </div>
                              ) : null}
                              <div
                                className={`secondary-text flex flex-wrap items-center gap-1 font-medium ${
                                  makeup.status === "completed"
                                    ? "text-[#a79996]"
                                    : "text-[#2d2928]"
                                }`}
                              >
                                {typeBadge("보충", "bg-[#fdf1e6] text-[#a2643c]")}
                                <span className="min-w-0 break-words">{makeup.studentName}</span>
                                {makeup.groupName ? (
                                  <span className="caption-text text-[#a79996]">
                                    {makeup.groupName}
                                  </span>
                                ) : null}
                                {makeup.status === "completed" ? (
                                  <span className="caption-text text-[#3e7d6b]">완료</span>
                                ) : null}
                              </div>
                            </Link>
                          ),
                        })),
                      ]
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map((row) => row.node)}

                      {/* 날짜-only 일정 — 가짜 시간(00:00) 없이 별도 구획.
                          구분선은 위에 시간 일정(보충)이 있을 때만 (빈 구획 위 divider 방지) */}
                      {dated > 0 ? (
                        <div
                          className={
                            dayMakeups.length > 0
                              ? "space-y-1.5 border-t border-dashed border-[#efe4dc] pt-1.5"
                              : "space-y-1.5"
                          }
                        >
                          {dayExams.map((event) => (
                            <Link
                              key={`e-${event.id}`}
                              href="/exams"
                              className="block min-w-0 rounded-xl border border-[#efe4dc] bg-white px-2.5 py-2 transition hover:bg-[#fdf7f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e0b28c]"
                            >
                              <div className="secondary-text flex flex-wrap items-center gap-1 font-medium text-[#2d2928]">
                                {typeBadge("시험", "bg-[#fbeee9] text-[#a25b4c]")}
                                <span className="min-w-0 break-words">{event.title}</span>
                              </div>
                              {event.group?.name ? (
                                <div className="caption-text text-[#a79996]">
                                  {event.group.name}
                                </div>
                              ) : null}
                            </Link>
                          ))}
                          {dayHomework.map((hw) => (
                            <Link
                              key={`h-${hw.id}`}
                              href={`/todos?month=${date.slice(0, 7)}&date=${date}`}
                              className="block min-w-0 rounded-xl border border-[#efe4dc] bg-white px-2.5 py-2 transition hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9b9e8]"
                            >
                              <div className="secondary-text flex flex-wrap items-center gap-1 font-medium text-[#2d2928]">
                                {typeBadge("숙제", "bg-[#f5f2ff] text-[#6652b9]")}
                                {hw.completed ? (
                                  <span className="caption-text text-[#3e7d6b]">완료</span>
                                ) : null}
                                {hw.groupId && groupNameById.get(hw.groupId) ? (
                                  <span className="caption-text text-[#a79996]">
                                    {groupNameById.get(hw.groupId)}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className={`secondary-text mt-0.5 line-clamp-2 break-words ${
                                  hw.completed ? "text-[#a79996] line-through" : "text-[#564d4d]"
                                }`}
                              >
                                {formatHomeworkDisplay({
                                  audienceLabel: homeworkAudienceLabel(hw.assignedStudentName),
                                  contextLabel: hw.textbook || hw.school,
                                  content: hw.content,
                                })}
                              </div>
                            </Link>
                          ))}
                          {dayTodos.map(({ group, item }) => (
                            <Link
                              key={`t-${item.id}`}
                              href={`/todos?month=${date.slice(0, 7)}&date=${date}`}
                              className="block min-w-0 rounded-xl border border-[#efe4dc] bg-white px-2.5 py-2 transition hover:bg-[#faf7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9b9e8]"
                            >
                              <div className="secondary-text flex flex-wrap items-center gap-1 font-medium text-[#2d2928]">
                                {typeBadge("할 일", "bg-[#f0f7f3] text-[#3e7d6b]")}
                                {item.completed ? (
                                  <span className="caption-text text-[#3e7d6b]">완료</span>
                                ) : null}
                                <span className="caption-text text-[#a79996]">{group.name}</span>
                              </div>
                              <div
                                className={`secondary-text mt-0.5 line-clamp-2 break-words ${
                                  item.completed ? "text-[#a79996] line-through" : "text-[#564d4d]"
                                }`}
                              >
                                {(() => {
                                  const context = linkedContextLabel(item);
                                  return context ? `${context} - ${item.text}` : item.text;
                                })()}
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
