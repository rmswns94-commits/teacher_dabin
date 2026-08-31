import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CalendarEventItem, EventCreateButton } from "@/components/calendar-events";
import { DailyLogsFilter } from "@/components/daily-logs-filter";
import { Doodle } from "@/components/doodle";
import { LessonLogDetail } from "@/components/lesson-log-detail";
import { PageHeader } from "@/components/page-header";
import { DailyLogStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  addDaysStr,
  addMonths,
  buildMonthGrid,
  dayOfWeekOf,
  monthLabel,
  monthRange,
  parseMonthParam,
} from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { formatTimeRange } from "@/lib/schedule";
import {
  getMonthlyEvents,
  type CalendarEventWithGroup,
} from "@/lib/supabase/queries/calendar-events";
import {
  getDailyLogDetailForCurrentUser,
  getMonthlyLogMarkers,
  type MonthlyLogMarker,
} from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { eventMetaOf } from "@/lib/validation/calendar-event";
import { cn } from "@/lib/utils";
import type { DailyLogStatus } from "@/lib/supabase/types";

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];

function buildQuery(params: {
  month: string;
  date?: string | null;
  groupId?: string;
  status?: string;
  log?: string | null;
}) {
  const query = new URLSearchParams();
  query.set("month", params.month);
  if (params.date) query.set("date", params.date);
  if (params.groupId) query.set("groupId", params.groupId);
  if (params.status) query.set("status", params.status);
  if (params.log) query.set("log", params.log);
  return `/daily-logs?${query.toString()}`;
}

export default async function DailyLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; date?: string; groupId?: string; status?: string; log?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);

  const month = parseMonthParam(params.month, currentMonth);
  const groupId = params.groupId || "";
  const status =
    params.status === "draft" || params.status === "completed" ? (params.status as DailyLogStatus) : "";
  const range = monthRange(month);

  const [markers, events, groups, schedules] = await Promise.all([
    getMonthlyLogMarkers(range.start, range.end, {
      groupId: groupId || undefined,
      status: status || undefined,
    }),
    getMonthlyEvents(range.start, range.end, { groupId: groupId || undefined }),
    getCurrentUserGroups(),
    getCurrentUserSchedulesWithGroup(),
  ]);

  // 그룹+요일 → 수업 시간 (정확히 하나일 때만 표시, 추측 금지)
  const scheduleMap = new Map<string, string[]>();
  for (const slot of schedules) {
    const key = `${slot.group_id}:${slot.day_of_week}`;
    scheduleMap.set(key, [
      ...(scheduleMap.get(key) ?? []),
      formatTimeRange(slot.start_time, slot.end_time),
    ]);
  }
  const timeFor = (logGroupId: string, date: string) => {
    const times = scheduleMap.get(`${logGroupId}:${dayOfWeekOf(date)}`) ?? [];
    return times.length === 1 ? times[0] : null;
  };

  const byDate = new Map<string, MonthlyLogMarker[]>();
  for (const marker of markers) {
    byDate.set(marker.class_date, [...(byDate.get(marker.class_date) ?? []), marker]);
  }

  // 기간 일정을 날짜별로 펼친다 (월 범위 내로 clamp).
  const eventsByDate = new Map<string, CalendarEventWithGroup[]>();
  for (const event of events) {
    const from = event.start_date > range.start ? event.start_date : range.start;
    const to = event.end_date < range.end ? event.end_date : range.end;
    for (let date = from; date <= to; date = addDaysStr(date, 1)) {
      eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), event]);
    }
  }

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));

  const dateParamValid = params.date && params.date.slice(0, 7) === month ? params.date : null;
  const selectedDate = dateParamValid ?? (month === currentMonth ? today : null);
  const dateLogs = selectedDate ? byDate.get(selectedDate) ?? [] : [];

  const logParamValid = params.log && dateLogs.some((log) => log.id === params.log) ? params.log : null;
  const selectedLogId = logParamValid ?? (dateLogs.length === 1 ? dateLogs[0].id : null);
  const detail = selectedLogId ? await getDailyLogDetailForCurrentUser(selectedLogId) : null;

  const weeks = buildMonthGrid(month);

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1150px]">
          <PageHeader
            title="수업 일지"
            description="매일의 수업 기록을 날짜별로 꺼내볼 수 있어요."
            action={
              <Button className="gap-2" asChild>
                <Link href="/daily-logs/new">
                  <Plus className="h-4 w-4" />
                  오늘 수업 기록하기
                </Link>
              </Button>
            }
          />

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <DailyLogsFilter
              groups={groupOptions}
              month={month}
              date={selectedDate}
              groupId={groupId}
              status={status}
            />
            <EventCreateButton groups={groupOptions} defaultDate={selectedDate ?? today} />
          </div>

          <Card className="mx-auto max-w-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={buildQuery({ month: addMonths(month, -1), groupId, status })}
                  aria-label="이전 달"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[#8a7b77] transition hover:bg-[#faf0f2]"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Link>
                <div className="flex items-center gap-2 font-display text-xl font-semibold text-[#2d2928]">
                  {monthLabel(month)}
                  <Doodle kind="sparkle" className="h-4 w-4 text-[#dcc4d3]" />
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={buildQuery({ month: addMonths(month, 1), groupId, status })}
                    aria-label="다음 달"
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-[#8a7b77] transition hover:bg-[#faf0f2]"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link
                    href={buildQuery({ month: currentMonth, date: today, groupId, status })}
                    className="rounded-xl px-2.5 py-1.5 text-xs text-[#8a7b77] transition hover:bg-[#faf0f2] hover:text-[#564d4d]"
                  >
                    오늘
                  </Link>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-[#b9a2a8]">
                {WEEKDAY_HEADERS.map((day) => (
                  <div key={day} className="py-1">{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {weeks.flat().map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} />;
                  }

                  const logs = byDate.get(date) ?? [];
                  const dayEvents = eventsByDate.get(date) ?? [];
                  const completedCount = logs.filter((log) => log.status === "completed").length;
                  const draftCount = logs.length - completedCount;
                  const isSelected = date === selectedDate;
                  const isToday = date === today;
                  const dayNumber = Number(date.slice(8));

                  const labelParts = [
                    formatKoreanDate(date),
                    logs.length > 0 ? `수업 기록 ${logs.length}개` : "",
                    completedCount > 0 ? `작성 완료 ${completedCount}건` : "",
                    draftCount > 0 ? `작성 중 ${draftCount}건` : "",
                    dayEvents.length > 0
                      ? `일정 ${dayEvents.length}개 (${dayEvents.map((event) => event.title).join(", ")})`
                      : "",
                    logs.length === 0 && dayEvents.length === 0 ? "기록 없음" : "",
                  ].filter(Boolean);

                  return (
                    <Link
                      key={date}
                      href={buildQuery({ month, date, groupId, status })}
                      aria-label={labelParts.join(", ")}
                      aria-current={isSelected ? "date" : undefined}
                      title={labelParts.slice(1).join(" · ")}
                      className={cn(
                        "mx-auto flex h-14 w-12 flex-col items-center justify-center rounded-2xl text-sm tabular-nums transition",
                        isSelected
                          ? "bg-[#fbe9f0] font-semibold text-[#6d4a5c] ring-1 ring-[#f4d8e2]"
                          : "text-[#4a423f] hover:bg-[#faf0f2]",
                        isToday && !isSelected && "ring-1 ring-[#d9c1e8]",
                      )}
                    >
                      <span>{dayNumber}</span>
                      {logs.length > 0 ? (
                        <span aria-hidden className="mt-0.5 flex items-center gap-0.5">
                          {completedCount > 0 ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#8fc7ab]" />
                          ) : null}
                          {draftCount > 0 ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#eebfa0]" />
                          ) : null}
                          {logs.length > 1 ? (
                            <span className="text-[9px] leading-none text-[#a08d97]">{logs.length}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span aria-hidden className="mt-0.5 h-1.5" />
                      )}
                      {dayEvents.length > 0 ? (
                        <span aria-hidden className="mt-0.5 flex items-center gap-0.5">
                          <span
                            className={cn("h-1 w-5 rounded-full", eventMetaOf(dayEvents[0].event_type).bar)}
                          />
                          {dayEvents.length > 1 ? (
                            <span className="text-[9px] leading-none text-[#a08d97]">+{dayEvents.length - 1}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span aria-hidden className="mt-0.5 h-1" />
                      )}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[#a08d97]">
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#8fc7ab]" /> 작성 완료
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#eebfa0]" /> 작성 중
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-1 w-4 rounded-full bg-[#b3a5ec]" /> 일정
                </span>
              </div>

              {markers.length === 0 ? (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-[#faf4ef] px-3 py-2.5 text-center text-xs text-[#8a7b77]">
                  <NotebookPen className="h-3.5 w-3.5 text-[#b9a2a8]" aria-hidden />
                  이번 달에는 아직 작성된 수업일지가 없어요.
                </div>
              ) : null}
            </CardContent>
          </Card>

          {selectedDate ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="font-display text-xl font-semibold text-[#2d2928]">
                  {formatKoreanDate(selectedDate, true)}
                </h2>
                <span className="text-sm text-[#8a7b77]">
                  {dateLogs.length > 0 ? `수업 ${dateLogs.length}개` : ""}
                </span>
              </div>

              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#8f5470]">오늘의 일정</h3>
                  <EventCreateButton
                    groups={groupOptions}
                    defaultDate={selectedDate}
                    label="일정 추가"
                    variant="ghost"
                  />
                </div>
                {(eventsByDate.get(selectedDate) ?? []).length === 0 ? (
                  <p className="mt-1.5 text-xs text-[#a08d97]">이날은 따로 등록된 일정이 없어요.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(eventsByDate.get(selectedDate) ?? []).map((event) => (
                      <CalendarEventItem key={event.id} event={event} groups={groupOptions} />
                    ))}
                  </div>
                )}
              </div>

              <h3 className="mt-5 text-sm font-semibold text-[#8f5470]">수업 기록</h3>

              {dateLogs.length === 0 ? (
                <Card className="mt-2">
                  <CardContent className="flex flex-col items-start gap-3 p-5 text-sm text-[#655d5d]">
                    이 날짜에는 작성된 수업 기록이 없어요.
                    <Button variant="secondary" size="sm" className="gap-1.5" asChild>
                      <Link href={`/daily-logs/new?date=${selectedDate}`}>
                        <Plus className="h-3.5 w-3.5" /> 수업 기록 작성하기
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="mt-3 grid items-start gap-4 lg:grid-cols-[0.42fr_0.58fr]">
                  <div className="space-y-2">
                    {dateLogs.map((log) => {
                      const isActive = log.id === selectedLogId;
                      const time = timeFor(log.group_id, selectedDate);

                      return (
                        <Link
                          key={log.id}
                          href={buildQuery({ month, date: selectedDate, groupId, status, log: log.id })}
                          aria-current={isActive ? "true" : undefined}
                          className={cn(
                            "block rounded-2xl border-2 border-dashed p-3.5 transition",
                            isActive
                              ? "border-[#f0c9d8] bg-[#fbe9f0] shadow-sm"
                              : "border-[#f0dae2] bg-white/90 hover:-translate-y-0.5 hover:bg-[#fdf6f8]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-medium text-[#2d2928]">
                              {isActive ? (
                                <BookOpen className="h-3.5 w-3.5 text-[#c06a8f]" aria-hidden />
                              ) : null}
                              {log.group?.name ?? "수업 그룹"}
                            </span>
                            <DailyLogStatusBadge status={log.status} />
                          </div>
                          {time ? (
                            <div className="mt-1 text-xs tabular-nums text-[#8a7b77]">{time}</div>
                          ) : null}
                          {log.title || log.default_progress ? (
                            <div className="mt-1 truncate text-xs text-[#7b746f]">
                              {[log.title, log.default_progress].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>

                  <div>
                    {detail ? (
                      <LessonLogDetail
                        detail={detail}
                        timeRange={timeFor(detail.group_id, detail.class_date)}
                      />
                    ) : (
                      <Card>
                        <CardContent className="p-6 text-sm text-[#8a7b77]">
                          반을 선택하면 그날의 수업 기록이 여기에 펼쳐져요 📖
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 text-center text-sm text-[#8a7b77]">
              달력에서 날짜를 선택하면 그날의 수업 기록을 볼 수 있어요.
            </div>
          )}

          <div className="pb-10" />
        </div>
      </main>
    </AppShell>
  );
}
