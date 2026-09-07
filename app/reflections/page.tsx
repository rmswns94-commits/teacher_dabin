import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
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

// 수업일지 캘린더와 같은 가족: 일요일 시작 grid, 큰 월 header, 오늘/선택 강조.
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

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
    "flex h-10 min-w-10 items-center justify-center rounded-xl border border-[#ece0db] bg-white px-2 text-sm font-medium text-[#564d4d] transition hover:bg-[#faf6f3]";

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <PageHeader
            title="✨ 수업 회고"
            description="날짜를 고르면 그날 모든 반의 회고를 하루 카드 하나로 모아 보여드려요."
          />

          {/* ── 월간 캘린더 ── */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3 pb-3">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#2b2323]">
                {monthLabel(month)}
              </h2>
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
            </div>

            {markers.failed ? (
              <div className="mb-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-2.5 text-sm text-[#7f5d57]">
                수업 회고를 불러오지 못했어요. 잠시 후 새로고침해주세요.
              </div>
            ) : null}

            <div className="grid grid-cols-7 border-b border-[#eee3dc] pb-1.5">
              {WEEKDAY_LABELS.map((label, index) => (
                <div
                  key={label}
                  className={cn(
                    "px-1.5 text-center text-[11px] font-semibold sm:text-left sm:text-xs",
                    index === 0 ? "text-[#b06a84]" : index === 6 ? "text-[#5c7ea6]" : "text-[#8a7b77]",
                  )}
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
                        className="min-h-[64px] border-b border-r border-[#f3eae3] bg-[#fbf8f4]/60 first:border-l sm:min-h-[76px]"
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
                        "min-h-[64px] min-w-0 border-b border-r border-[#f3eae3] px-1 py-1 transition first:border-l sm:min-h-[76px] sm:px-1.5",
                        "bg-white hover:bg-[#faf7f3]",
                        isSelected && "ring-1 ring-inset ring-[#c9b9e8]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                          isToday
                            ? "bg-[#8b7ae6] text-white"
                            : dayIndex === 0
                              ? "text-[#b06a84]"
                              : dayIndex === 6
                                ? "text-[#5c7ea6]"
                                : "text-[#453b3b]",
                        )}
                      >
                        {Number(date.slice(8))}
                      </span>
                      {count > 0 ? (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-md bg-[#efe8fb] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[#5d4ba5]">
                          ✦ {count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </Card>

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
