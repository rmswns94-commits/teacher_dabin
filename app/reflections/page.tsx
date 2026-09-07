import Link from "next/link";
import { CalendarRange, ChevronLeft, ChevronRight, History } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { CatDoodle } from "@/components/cat-doodle";
import { PageHeader } from "@/components/page-header";
import {
  ReflectionDayCard,
  type DayReflectionClass,
  type DaySummary,
} from "@/components/reflection-day-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  addMonths,
  buildMonthGrid,
  dayOfWeekOf,
  monthLabel,
  monthRange,
  parseMonthParam,
} from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { compareKoreanName } from "@/lib/korean-sort";
import { formatTimeHM } from "@/lib/schedule";
import {
  getMonthlyReflectionMarkers,
  getReflectionsForDate,
} from "@/lib/supabase/queries/reflections";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { cn } from "@/lib/utils";

// 초록 노트 달력 디자인(참고 이미지): 일요일 시작, 진초록 요일 헤더(SUN~SAT),
// 일요일 숫자는 웜 오렌지, 구름 속 큰 월 숫자 + 마스코트 고양이 장식.
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

const MONTH_EN = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

export default async function ReflectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; date?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  const month = parseMonthParam(params.month, today.slice(0, 7));
  const range = monthRange(month);
  const selectedDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;

  const [markers, dayResult, schedules] = await Promise.all([
    // 월간 marker는 id/날짜만 lightweight batch (본문은 날짜 선택 시에만)
    getMonthlyReflectionMarkers(range.start, range.end),
    selectedDate
      ? getReflectionsForDate(selectedDate)
      : Promise.resolve({ rows: [], failed: false }),
    // 반별 수업 시작 시간 정렬용 — AppShell과 요청당 1쿼리로 dedupe
    getCurrentUserSchedulesWithGroup(),
  ]);

  // 날짜별 회고 반 수 (회고가 하나라도 있는 일지 수 — 하드코딩 없음)
  const countByDate = new Map<string, number>();
  for (const row of markers.rows) {
    countByDate.set(row.class_date, (countByDate.get(row.class_date) ?? 0) + 1);
  }

  const weeks = buildMonthGrid(month);

  // ── 선택 날짜: 반별 회고 + 수업 시작 시간순 정렬 + 하루 종합 bullets ──
  let dayClasses: DayReflectionClass[] = [];
  let daySummary: DaySummary = { good: [], hard: [], next: [] };

  if (selectedDate && dayResult.rows.length > 0) {
    const dow = dayOfWeekOf(selectedDate);
    const startByGroup = new Map<string, string>();
    for (const slot of schedules) {
      if (slot.day_of_week !== dow) {
        continue;
      }
      const time = formatTimeHM(slot.start_time);
      const current = startByGroup.get(slot.group_id);
      if (!current || time < current) {
        startByGroup.set(slot.group_id, time);
      }
    }

    dayClasses = dayResult.rows
      .map((row) => ({
        id: row.id,
        time: startByGroup.get(row.group_id) ?? null,
        groupName: row.group?.name ?? "수업 그룹",
        groupIcon: row.group?.icon ?? null,
        good: row.reflection_good,
        hard: row.reflection_hard,
        next: row.reflection_next,
      }))
      .sort((a, b) => {
        // 실제 수업 시작 시간순 — 시간표가 없으면 그룹 이름 가나다순 fallback (뒤로)
        if (a.time && b.time) {
          return a.time.localeCompare(b.time) || compareKoreanName(a.groupName, b.groupName);
        }
        if (a.time) return -1;
        if (b.time) return 1;
        return compareKoreanName(a.groupName, b.groupName);
      });

    // 하루 종합: Teacher 원문 bullet 그대로 (trim + 완전 동일 문구만 dedupe, 수업 순서 유지 —
    // category별 source 분리, AI/창작 없음)
    const collect = (pick: (item: DayReflectionClass) => string | null) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of dayClasses) {
        const value = pick(item)?.trim();
        if (!value || seen.has(value)) {
          continue;
        }
        seen.add(value);
        out.push(value);
      }
      return out;
    };

    daySummary = {
      good: collect((item) => item.good),
      hard: collect((item) => item.hard),
      next: collect((item) => item.next),
    };
  }

  const dateHref = (date: string) => `/reflections?month=${month}&date=${date}`;
  const monthHref = (value: string) => `/reflections?month=${value}`;
  const navButton =
    "flex h-9 min-w-9 items-center justify-center rounded-xl border border-[#bcd9b4] bg-white px-2 text-sm font-medium text-[#3f7d54] transition hover:bg-[#f2f9ef]";
  const monthEn = MONTH_EN[Number(month.slice(5, 7)) - 1];
  const monthTotal = markers.rows.length;

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <PageHeader
            title="✨ 수업 회고"
            description="날짜를 고르면 그날 모든 반의 회고를 하루 카드 하나로 모아 보여드려요."
          />

          {/* ── 월간 캘린더 (초록 노트 디자인) ── */}
          <Card className="overflow-hidden border-[#cfe4c8] bg-[#ecf6e8] p-0">
            {/* 상단 바: MONTH / nav / YEAR */}
            <div className="px-4 pt-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-[#3f7d54] pt-2.5">
                <span className="text-sm font-bold tracking-[0.18em] text-[#3f7d54]">{monthEn}</span>
                <div className="flex items-center gap-1">
                  <Link href={monthHref(addMonths(month, -1))} aria-label="이전 달" className={navButton}>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                  <Link href={dateHref(today)} className={navButton}>
                    오늘
                  </Link>
                  <Link href={monthHref(addMonths(month, 1))} aria-label="다음 달" className={navButton}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
                <span className="text-sm font-bold tracking-[0.18em] text-[#3f7d54]">
                  {month.slice(0, 4)}
                </span>
              </div>
            </div>

            {markers.failed ? (
              <div className="mx-4 mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-2.5 text-sm text-[#7f5d57] sm:mx-6">
                수업 회고를 불러오지 못했어요. 잠시 후 새로고침해주세요.
              </div>
            ) : null}

            {/* 일러스트 존 + 구름 속 큰 월 숫자 */}
            <div className="px-4 sm:px-6">
              <div aria-hidden className="flex items-end justify-between px-2 pt-1 text-xl sm:text-2xl">
                <span>🌳</span>
                <span className="pb-1 text-base">🌷</span>
                <CatDoodle className="-mb-1 h-12 w-14" />
                <span className="pb-1 text-base">🌼</span>
                <span>🌲</span>
              </div>
              <div className="mx-auto -mb-px flex h-14 w-44 items-center justify-center rounded-t-[70px] bg-white sm:h-16">
                <span className="font-display text-4xl font-bold tracking-[0.06em] text-[#3f7d54]">
                  {month.slice(5, 7)}
                </span>
              </div>
            </div>

            {/* 흰 달력 sheet */}
            <div className="bg-white px-2.5 pb-4 sm:px-4">
              {/* 진초록 요일 헤더 */}
              <div className="grid grid-cols-7 overflow-hidden rounded-lg bg-[#3f7d54]">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="border-r border-white/25 py-1.5 text-center text-[10px] font-bold tracking-[0.06em] text-white last:border-r-0 sm:text-[11px]"
                  >
                    {label}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7">
                  {week.map((date, dayIndex) => {
                    if (!date) {
                      return (
                        <div
                          key={`empty-${dayIndex}`}
                          className="min-h-[64px] border-b border-r border-[#e4efdd] bg-[#f7fbf4]/70 first:border-l sm:min-h-[76px]"
                        />
                      );
                    }

                    const count = countByDate.get(date) ?? 0;
                    const isToday = date === today;
                    const isSelected = date === selectedDate;

                    return (
                      <Link
                        key={date}
                        href={dateHref(date)}
                        aria-label={`${formatKoreanDate(date, true)} 수업 회고 ${count}개`}
                        className={cn(
                          "min-h-[64px] min-w-0 border-b border-r border-[#e4efdd] px-1 py-1 transition first:border-l sm:min-h-[76px]",
                          "bg-white hover:bg-[#f4faf1]",
                          isSelected && "ring-1 ring-inset ring-[#8cc39b]",
                        )}
                      >
                        {/* 날짜 숫자 가운데 정렬 — 일요일은 웜 오렌지 (참고 디자인) */}
                        <div className="flex min-w-0 flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                              isToday
                                ? "bg-[#4d9163] text-white"
                                : dayIndex === 0
                                  ? "text-[#e8863c]"
                                  : "text-[#334638]",
                            )}
                          >
                            {Number(date.slice(8))}
                          </span>
                          {count > 0 ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e3f2df] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#3a7048]">
                              ✦ {count}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}

              {/* 하단 노트 라인 + 마스코트 + 캡션 */}
              <div className="mt-4 flex items-end gap-3 px-2">
                <CatDoodle variant="heart" className="h-10 w-12 shrink-0" />
                <div className="flex-1 space-y-3.5 pb-1">
                  <div className="border-b border-[#cfe4c8]" />
                  <div className="border-b border-[#cfe4c8]" />
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-[#6b9678]">
                {monthLabel(month)}의 수업 회고 {monthTotal}개 — 돌아본 만큼 수업이 자라요.
              </p>
            </div>
          </Card>

          {/* ── 누적 회고 아카이브 — 월 버튼의 월은 현재 캘린더 표시 월(URL month)이 기준
              (new Date() 기준 금지: 월 이동 시 label도 함께 바뀐다) ── */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/reflections/monthly?month=${month}`}
              className="flex min-h-11 items-center gap-1.5 rounded-2xl border border-[#e2d8f3] bg-white px-4 text-sm font-medium text-[#5c4ca8] shadow-sm transition hover:bg-[#faf7ff]"
            >
              <CalendarRange className="h-4 w-4" aria-hidden />
              {monthLabel(month)} 누적 회고
            </Link>
            <Link
              href="/reflections/archive"
              className="flex min-h-11 items-center gap-1.5 rounded-2xl border border-[#e2d8f3] bg-white px-4 text-sm font-medium text-[#5c4ca8] shadow-sm transition hover:bg-[#faf7ff]"
            >
              <History className="h-4 w-4" aria-hidden />
              전체 누적 회고
            </Link>
          </div>

          {/* ── 선택 날짜의 하루 회고 ── */}
          <div className="mt-5 space-y-3 pb-10">
            {!selectedDate ? (
              <p className="text-sm text-[#8a8a93]">
                캘린더에서 날짜를 선택하면 그날의 수업 회고를 모아 보여드려요.
              </p>
            ) : dayResult.failed ? (
              <Card>
                <CardContent className="p-5 text-sm text-[#7f5d57]">
                  이날 수업 회고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
                </CardContent>
              </Card>
            ) : dayClasses.length === 0 ? (
              <Card>
                <CardContent className="p-5 text-sm text-[#655d5d]">
                  {formatKoreanDate(selectedDate, true)} — 이날 작성된 수업 회고가 없어요.
                </CardContent>
              </Card>
            ) : (
              <ReflectionDayCard
                dateLabel={formatKoreanDate(selectedDate, true)}
                classes={dayClasses}
                summary={daySummary}
              />
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
