import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CalendarEventItem, EventCreateButton } from "@/components/calendar-events";
import { DailyLogsFilter } from "@/components/daily-logs-filter";
import { ExcelExportButton } from "@/components/excel-export";
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
import { groupIconOf } from "@/lib/group-icons";
import { formatTimeRange } from "@/lib/schedule";
import {
  getMonthlyEvents,
  type CalendarEventWithGroup,
} from "@/lib/supabase/queries/calendar-events";
import {
  getDailyLogDetailForCurrentUser,
  getMonthlyLogMarkers,
  getPraisesForDailyLog,
  type MonthlyLogMarker,
} from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import {
  getMonthlyScheduledMakeups,
  type MonthlyMakeupMarker,
} from "@/lib/supabase/queries/makeups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { eventMetaOf } from "@/lib/validation/calendar-event";
import { cn } from "@/lib/utils";
import type { DailyLogStatus } from "@/lib/supabase/types";

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_HEADERS_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const MONTH_NAMES_EN = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

// 참고용 미니 달력 (인접 달) — 클릭하면 그 달로 이동
function MiniCalendar({ month, href }: { month: string; href: string }) {
  const weeks = buildMonthGrid(month);
  const monthNum = Number(month.slice(5));

  return (
    <Link
      href={href}
      aria-label={`${monthLabel(month)}로 이동`}
      className="block rounded-2xl border border-[#e9e3f5] bg-white px-2.5 py-2 transition hover:border-[#cfc4f0] hover:bg-[#faf8ff]"
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-xs font-bold tabular-nums text-[#6d5aa8]">
          {String(monthNum).padStart(2, "0")}
        </span>
        <span className="text-[9px] font-medium tracking-[0.08em] text-[#a49bc4]">
          {MONTH_NAMES_EN[monthNum - 1].slice(0, 3)}
        </span>
      </span>
      <span className="mt-1 grid w-[112px] grid-cols-7 text-center text-[8px] leading-[13px] tabular-nums text-[#8a8a93]">
        {WEEKDAY_HEADERS.map((day, i) => (
          <span
            key={day}
            className={cn(
              "font-semibold text-[#b0a8c9]",
              i === 0 && "text-[#d0908f]",
              i === 6 && "text-[#8fa0cf]",
            )}
          >
            {day}
          </span>
        ))}
        {weeks.flat().map((date, i) =>
          date ? (
            <span
              key={date}
              className={cn(i % 7 === 0 && "text-[#c98a89]", i % 7 === 6 && "text-[#8698c7]")}
            >
              {Number(date.slice(8))}
            </span>
          ) : (
            <span key={`e-${i}`} />
          ),
        )}
      </span>
    </Link>
  );
}

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
  searchParams?: Promise<{ month?: string; date?: string; groupId?: string; status?: string; log?: string; deleted?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);

  const month = parseMonthParam(params.month, currentMonth);
  const groupId = params.groupId || "";
  const status =
    params.status === "draft" || params.status === "completed" ? (params.status as DailyLogStatus) : "";
  const range = monthRange(month);

  const [markers, events, groups, schedules, monthlyMakeups] = await Promise.all([
    getMonthlyLogMarkers(range.start, range.end, {
      groupId: groupId || undefined,
      status: status || undefined,
    }),
    getMonthlyEvents(range.start, range.end, { groupId: groupId || undefined }),
    getCurrentUserGroups(),
    getCurrentUserSchedulesWithGroup(),
    getMonthlyScheduledMakeups(range.start, range.end),
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

  // 날짜별 대표 아이콘: 수업 시간 순(모르면 기록 순), 같은 반은 한 번만 (추가 쿼리 없음)
  const iconsFor = (date: string) => {
    const sorted = [...(byDate.get(date) ?? [])].sort((a, b) => {
      const timeA = timeFor(a.group_id, date) ?? "99:99";
      const timeB = timeFor(b.group_id, date) ?? "99:99";
      return timeA.localeCompare(timeB) || a.created_at.localeCompare(b.created_at);
    });
    const seenGroups = new Set<string>();
    const icons: string[] = [];
    for (const log of sorted) {
      if (seenGroups.has(log.group_id)) continue;
      seenGroups.add(log.group_id);
      icons.push(groupIconOf(log.group?.icon));
    }
    return icons;
  };

  // 기간 일정을 날짜별로 펼친다 (월 범위 내로 clamp).
  const eventsByDate = new Map<string, CalendarEventWithGroup[]>();
  for (const event of events) {
    const from = event.start_date > range.start ? event.start_date : range.start;
    const to = event.end_date < range.end ? event.end_date : range.end;
    for (let date = from; date <= to; date = addDaysStr(date, 1)) {
      eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), event]);
    }
  }

  // 예정된 보충을 날짜별로 (makeup record가 source of truth — calendar_events 복제 없음)
  const makeupsByDate = new Map<string, MonthlyMakeupMarker[]>();
  for (const makeup of monthlyMakeups) {
    makeupsByDate.set(makeup.scheduled_date, [
      ...(makeupsByDate.get(makeup.scheduled_date) ?? []),
      makeup,
    ]);
  }

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));

  // 기간 일정이 날짜를 넘어 이어져 보이도록, 겹치는 일정끼리는 서로 다른
  // "레인"에 고정 배정한다 (달력에는 위 2개 레인만 바로 표시).
  const sortedEvents = [...events].sort(
    (a, b) => a.start_date.localeCompare(b.start_date) || a.created_at.localeCompare(b.created_at),
  );
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();
  for (const event of sortedEvents) {
    let lane = laneEnds.findIndex((end) => end < event.start_date);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(event.end_date);
    } else {
      laneEnds[lane] = event.end_date;
    }
    laneOf.set(event.id, lane);
  }

  const dateParamValid = params.date && params.date.slice(0, 7) === month ? params.date : null;
  const selectedDate = dateParamValid ?? (month === currentMonth ? today : null);

  // 목록은 시작 시간을 알 수 있으면 시간순으로 (모르면 원래 순서, 가짜 시간 금지)
  const dateLogs = [...(selectedDate ? (byDate.get(selectedDate) ?? []) : [])].sort((a, b) => {
    const timeA = selectedDate ? (timeFor(a.group_id, selectedDate) ?? "99:99") : "99:99";
    const timeB = selectedDate ? (timeFor(b.group_id, selectedDate) ?? "99:99") : "99:99";
    return timeA.localeCompare(timeB);
  });

  // 상세는 사용자가 반을 직접 클릭했을 때만 (자동 선택 금지 — 날짜만 바꾸면 항상 초기화)
  const logParamValid = params.log && dateLogs.some((log) => log.id === params.log) ? params.log : null;
  const selectedLogId = logParamValid;
  const [detail, detailPraises] = selectedLogId
    ? await Promise.all([
        getDailyLogDetailForCurrentUser(selectedLogId),
        getPraisesForDailyLog(selectedLogId),
      ])
    : [null, []];

  const weeks = buildMonthGrid(month);

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1150px]">
          {params.deleted ? (
            <div className="mb-4 rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-3 text-sm text-[#2f6d54]">
              수업일지를 삭제했어요.
            </div>
          ) : null}
          <PageHeader
            title="수업 일지"
            description="매일의 수업 기록을 날짜별로 꺼내볼 수 있어요."
            action={
              <div className="flex flex-wrap gap-2">
                <ExcelExportButton date={selectedDate} />
                <Button className="gap-2" asChild>
                  <Link href="/daily-logs/new">
                    <Plus className="h-4 w-4" />
                    오늘 수업 기록하기
                  </Link>
                </Button>
              </div>
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

          <Card>
            <CardContent className="p-4 md:p-6">
              {/* 플래너 스타일 헤더: 큰 월 표시 + 우측 인접 달 미니 캘린더 */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-end gap-3">
                    <span className="font-display text-5xl font-bold leading-none tracking-tight text-[#6d5aa8] md:text-6xl">
                      {month.slice(5)}
                    </span>
                    <div className="pb-0.5 leading-snug">
                      <div className="text-sm font-bold tracking-[0.14em] text-[#2d2928] md:text-base">
                        / {MONTH_NAMES_EN[Number(month.slice(5)) - 1]}
                      </div>
                      <div className="text-xs font-semibold tracking-[0.1em] text-[#a08d97] md:text-sm">
                        / {month.slice(0, 4)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1">
                    <Link
                      href={buildQuery({ month: addMonths(month, -1), groupId, status })}
                      aria-label="이전 달"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#eee9f6] text-[#8a7b77] transition hover:bg-[#faf8ff]"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      href={buildQuery({ month: addMonths(month, 1), groupId, status })}
                      aria-label="다음 달"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#eee9f6] text-[#8a7b77] transition hover:bg-[#faf8ff]"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      href={buildQuery({ month: currentMonth, date: today, groupId, status })}
                      className="rounded-xl border border-[#eee9f6] px-2.5 py-1.5 text-xs text-[#8a7b77] transition hover:bg-[#faf8ff] hover:text-[#564d4d]"
                    >
                      오늘
                    </Link>
                  </div>
                </div>

                <div className="hidden gap-2.5 md:flex">
                  <MiniCalendar
                    month={addMonths(month, -1)}
                    href={buildQuery({ month: addMonths(month, -1), groupId, status })}
                  />
                  <MiniCalendar
                    month={addMonths(month, 1)}
                    href={buildQuery({ month: addMonths(month, 1), groupId, status })}
                  />
                </div>
              </div>

              {/* 요일 헤더 */}
              <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-t-2xl border border-b-0 border-[#e3ddf1] bg-[#f7f4fd] text-center text-[11px] font-semibold md:text-xs">
                {WEEKDAY_HEADERS.map((day, headerIndex) => (
                  <div
                    key={day}
                    className={cn(
                      "border-l border-[#eee9f6] py-2 first:border-l-0",
                      headerIndex === 0
                        ? "text-[#c97a7a]"
                        : headerIndex === 6
                          ? "text-[#7a8fc9]"
                          : "text-[#6b6b74]",
                    )}
                  >
                    <span className="md:hidden">{day}</span>
                    <span className="max-md:hidden">{WEEKDAY_HEADERS_FULL[headerIndex]}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 overflow-hidden rounded-b-2xl border border-[#e3ddf1] bg-white">
                {weeks.flat().map((date, index) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className={cn(
                          "min-h-[84px] border-l border-t border-[#eee9f6] bg-[#fbfafd] md:min-h-[118px]",
                          index % 7 === 0 && "border-l-0",
                          index < 7 && "border-t-0",
                        )}
                      />
                    );
                  }

                  const logs = byDate.get(date) ?? [];
                  const dayEvents = eventsByDate.get(date) ?? [];
                  const dayMakeups = makeupsByDate.get(date) ?? [];
                  const completedCount = logs.filter((log) => log.status === "completed").length;
                  const draftCount = logs.length - completedCount;
                  const icons = iconsFor(date);
                  const isSelected = date === selectedDate;
                  const isToday = date === today;
                  const dayNumber = Number(date.slice(8));
                  const columnIndex = index % 7;
                  const isSunday = columnIndex === 0;
                  const isSaturday = columnIndex === 6;
                  const hasHoliday = dayEvents.some((event) => event.event_type === "holiday");

                  // 레인별 첫 일정만 바로 표시 (연속 표시용)
                  const laneEvents: (CalendarEventWithGroup | null)[] = [null, null];
                  for (const event of dayEvents) {
                    const lane = laneOf.get(event.id) ?? 0;
                    if (lane < 2 && !laneEvents[lane]) {
                      laneEvents[lane] = event;
                    }
                  }

                  const groupNames = logs
                    .map((log) => log.group?.name)
                    .filter((name): name is string => Boolean(name));
                  const labelParts = [
                    formatKoreanDate(date),
                    logs.length > 0
                      ? `수업 기록 ${logs.length}개${groupNames.length > 0 ? ` (${groupNames.join(", ")})` : ""}`
                      : "",
                    completedCount > 0 ? `작성 완료 ${completedCount}건` : "",
                    draftCount > 0 ? `작성 중 ${draftCount}건` : "",
                    dayEvents.length > 0
                      ? `일정 ${dayEvents.length}개 (${dayEvents.map((event) => event.title).join(", ")})`
                      : "",
                    dayMakeups.length > 0
                      ? `보충 ${dayMakeups.length}건 (${dayMakeups
                          .map((makeup) => makeup.student?.name ?? "학생")
                          .join(", ")})`
                      : "",
                    logs.length === 0 && dayEvents.length === 0 && dayMakeups.length === 0
                      ? "기록 없음"
                      : "",
                  ].filter(Boolean);

                  return (
                    <Link
                      key={date}
                      href={buildQuery({ month, date, groupId, status })}
                      aria-label={labelParts.join(", ")}
                      aria-current={isSelected ? "date" : undefined}
                      title={labelParts.slice(1).join(" · ")}
                      className={cn(
                        "flex min-h-[84px] flex-col border-l border-t border-[#eee9f6] p-1 pb-1.5 transition md:min-h-[118px] md:p-1.5",
                        columnIndex === 0 && "border-l-0",
                        index < 7 && "border-t-0",
                        isSunday && !isSelected && "bg-[#faf7f4]",
                        isSelected
                          ? "bg-[#f5f1fb] shadow-[inset_0_0_0_2px_#cfc4f0]"
                          : "hover:bg-[#faf8ff]",
                      )}
                    >
                      <span className="flex items-center gap-1">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums md:h-6 md:w-6 md:text-xs",
                            hasHoliday
                              ? "text-[#cf4f4f]"
                              : isSunday
                                ? "text-[#c97a7a]"
                                : isSaturday
                                  ? "text-[#7a8fc9]"
                                  : "text-[#4a423f]",
                            isToday && "bg-[#8b7ae6] font-bold text-white",
                          )}
                        >
                          {dayNumber}
                        </span>
                        {dayMakeups.length > 0 ? (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-white ring-1 ring-[#3d7f64]"
                          />
                        ) : null}
                      </span>

                      {/* 수업일지가 있는 반은 대표 아이콘만 — 전부 표시, 넘치면 줄바꿈 (이름/상세는 아래 목록에서) */}
                      {icons.length > 0 ? (
                        <span
                          aria-hidden
                          className="mt-0.5 flex flex-wrap items-center gap-x-0.5 px-0.5 text-[13px] leading-[18px] md:mt-1 md:text-[15px] md:leading-5"
                        >
                          {icons.map((icon, iconIndex) => (
                            <span key={`${icon}-${iconIndex}`}>{icon}</span>
                          ))}
                        </span>
                      ) : null}

                      {/* 일정 바: 같은 일정은 옆 날짜와 이어져 보이도록 셀 전체 폭 사용 */}
                      <span
                        aria-hidden
                        className="-mx-1 mt-auto flex flex-col gap-[3px] pt-1 md:-mx-1.5"
                      >
                        {laneEvents.map((event, laneIndex) =>
                          event ? (
                            <span
                              key={laneIndex}
                              className={cn(
                                "h-[5px] w-full",
                                eventMetaOf(event.event_type).bar,
                                date === event.start_date && "rounded-l-full",
                                date === event.end_date && "rounded-r-full",
                              )}
                            />
                          ) : (
                            <span key={laneIndex} className="h-[5px]" />
                          ),
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[#a08d97]">
                <span className="flex items-center gap-1">
                  <span aria-hidden className="text-[11px] leading-none">📘</span> 반 대표 아이콘 = 수업일지
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-1 w-4 rounded-full bg-[#b3a5ec]" /> 일정
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white ring-1 ring-[#3d7f64]" /> 보충 예정
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

              {(makeupsByDate.get(selectedDate) ?? []).length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-[#8f5470]">보충 수업</h3>
                  <div className="mt-2 space-y-2">
                    {(makeupsByDate.get(selectedDate) ?? []).map((makeup) => (
                      <Link
                        key={makeup.id}
                        href="/makeups"
                        className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e6e6ea] bg-white px-3.5 py-2.5 text-sm transition hover:bg-[#f4faf7]"
                      >
                        <span className="rounded-full bg-[#e4f4ec] px-2 py-0.5 text-[11px] font-medium text-[#3d7f64]">
                          보충
                        </span>
                        {makeup.start_time ? (
                          <span className="tabular-nums text-[#33333b]">
                            {makeup.start_time.slice(0, 5)}
                          </span>
                        ) : null}
                        <span className="font-medium text-[#232327]">
                          {makeup.student?.name ?? "학생"}
                        </span>
                        {makeup.group?.name ? (
                          <span className="text-xs text-[#6b6b74]">{makeup.group.name}</span>
                        ) : null}
                        {makeup.missed_progress ? (
                          <span className="truncate text-xs text-[#8a8a93]">
                            {makeup.missed_progress}
                          </span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

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
                <>
                  {/* 반 목록: content 전체 폭을 쓰는 가로 Card. 선택 전에는 빈 상세 panel 없음 */}
                  <div className="mt-3 space-y-3">
                    {dateLogs.map((log) => {
                      const isActive = log.id === selectedLogId;
                      const time = timeFor(log.group_id, selectedDate);
                      const meta = [
                        time,
                        log.studentCount > 0 ? `학생 ${log.studentCount}명` : null,
                      ].filter(Boolean);

                      return (
                        <Link
                          key={log.id}
                          // 선택된 카드를 다시 클릭하면 선택 해제 → 상세가 닫힌다
                          href={buildQuery({
                            month,
                            date: selectedDate,
                            groupId,
                            status,
                            log: isActive ? null : log.id,
                          })}
                          aria-current={isActive ? "true" : undefined}
                          aria-expanded={isActive}
                          className={cn(
                            "flex items-center gap-3.5 rounded-2xl border-2 border-dashed px-4 py-4 transition",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8]",
                            isActive
                              ? "border-[#d9c9ef] bg-[#f5f1fb] shadow-sm"
                              : "border-[#f0dae2] bg-white/90 hover:border-[#e8cfda] hover:bg-[#fdf6f8]",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                              isActive ? "bg-white text-[#6d5aa8]" : "bg-[#f5f1fb] text-[#8b7ae6]",
                            )}
                          >
                            <BookOpen className="h-[18px] w-[18px]" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-[#2d2928]">
                              {log.group?.name ?? "수업 그룹"}
                            </span>
                            {meta.length > 0 ? (
                              <span className="mt-0.5 block text-xs tabular-nums text-[#8a7b77]">
                                {meta.join(" · ")}
                              </span>
                            ) : null}
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5">
                            <DailyLogStatusBadge status={log.status} />
                            <ChevronRight className="h-4 w-4 text-[#c9b6bd]" aria-hidden />
                          </span>
                        </Link>
                      );
                    })}
                  </div>

                  {/* 상세: 반을 클릭했을 때만 목록 아래 full-width로 */}
                  {detail ? (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-semibold text-[#8f5470]">선택한 수업</h3>
                      <LessonLogDetail
                        detail={detail}
                        timeRange={timeFor(detail.group_id, detail.class_date)}
                        praises={detailPraises}
                      />
                    </div>
                  ) : null}
                </>
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
