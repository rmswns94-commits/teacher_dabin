import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { dayOfWeekOf, monthLabel, monthRange, parseMonthParam } from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import { compareKoreanName } from "@/lib/korean-sort";
import { collectMonthlyBullets } from "@/lib/reflection-archive";
import { formatTimeHM } from "@/lib/schedule";
import {
  getReflectionsForRange,
  type DayReflectionRow,
} from "@/lib/supabase/queries/reflections";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { cn } from "@/lib/utils";

// 월 누적 회고 — Daily Log의 reflection_good/hard/next를 월 단위로 모아 보는 아카이브.
// 원본은 daily_logs 조회 기반 (별도 sync table 없음 → 일지 수정/삭제/날짜 이동이 즉시 반영).
// AI/한줄요약 없음: deterministic aggregation(원문 trim+완전 중복 제거)만 사용한다.

const SECTIONS = [
  {
    key: "good",
    icon: "✨",
    title: "이번 달 잘된 점",
    classLabel: "잘된 점",
    labelClass: "text-[#3e7d6b]",
    boxClass: "border-[#dcebe2] bg-[#f6fbf8]",
  },
  {
    key: "hard",
    icon: "🌿",
    title: "이번 달 아쉬운 점",
    classLabel: "아쉬웠던 점",
    labelClass: "text-[#8a5d52]",
    boxClass: "border-[#f0ded8] bg-[#fdf8f5]",
  },
  {
    key: "next",
    icon: "💡",
    title: "다음엔 다르게",
    classLabel: "다음에 다르게",
    labelClass: "text-[#5c4ca8]",
    boxClass: "border-[#e2d8f3] bg-[#faf7ff]",
  },
] as const;

export default async function MonthlyReflectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  // invalid month param은 현재 월로 안전하게 fallback
  const month = parseMonthParam(params.month, today.slice(0, 7));
  const range = monthRange(month);

  const [result, schedules] = await Promise.all([
    // 한 달 회고를 그룹 embed와 함께 1쿼리 batch
    getReflectionsForRange(range.start, range.end),
    // 반별 수업 시작 시간 정렬용 — AppShell과 요청당 1쿼리로 dedupe
    getCurrentUserSchedulesWithGroup(),
  ]);

  const rows = result.rows;

  // 통계: 회고 작성일 = distinct class_date, 회고 수업 = 회고 있는 일지 수
  const dateCount = new Set(rows.map((row) => row.class_date)).size;
  const logCount = rows.length;

  // 요일별 그룹 시작 시간 (반 정렬용 — 날짜마다 재계산하지 않게 미리 접는다)
  const startByDow = new Map<number, Map<string, string>>();
  for (const slot of schedules) {
    const byGroup = startByDow.get(slot.day_of_week) ?? new Map<string, string>();
    const time = formatTimeHM(slot.start_time);
    const current = byGroup.get(slot.group_id);
    if (!current || time < current) {
      byGroup.set(slot.group_id, time);
    }
    startByDow.set(slot.day_of_week, byGroup);
  }

  // 날짜별 grouping (최신 날짜 desc) + 각 날짜 안에서 수업 시작 시간 asc (없으면 이름 가나다)
  const byDate = new Map<string, DayReflectionRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.class_date) ?? [];
    list.push(row);
    byDate.set(row.class_date, list);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  const sortedClassesOf = (date: string) => {
    const byGroup = startByDow.get(dayOfWeekOf(date)) ?? new Map<string, string>();
    return (byDate.get(date) ?? [])
      .map((row) => ({
        row,
        time: byGroup.get(row.group_id) ?? null,
        name: row.group?.name ?? "수업 그룹",
      }))
      .sort((a, b) => {
        if (a.time && b.time) {
          return a.time.localeCompare(b.time) || compareKoreanName(a.name, b.name);
        }
        if (a.time) return -1;
        if (b.time) return 1;
        return compareKoreanName(a.name, b.name);
      });
  };

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <PageHeader
            backHref={`/reflections?month=${month}`}
            title={`${monthLabel(month)} 누적 회고`}
            description={`${Number(month.slice(5, 7))}월의 수업 기록을 한눈에 돌아봐요.`}
          />

          {result.failed ? (
            <Card>
              <CardContent className="p-5 text-sm text-[#7f5d57]">
                수업 회고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">
                이 달에는 작성된 수업 회고가 없어요.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5 pb-10">
              {/* 기본 통계 — compact chip */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-[#efe8fb] px-2.5 py-1 text-xs font-medium tabular-nums text-[#5d4ba5]">
                  회고 작성일 {dateCount}일
                </span>
                <span className="rounded-full bg-[#e4f4ec] px-2.5 py-1 text-xs font-medium tabular-nums text-[#3d7f64]">
                  회고 수업 {logCount}개
                </span>
              </div>

              {/* 3개 누적 영역 — category별 원문 bullet (trim + 완전 중복 제거, 날짜순) */}
              {SECTIONS.map((section) => {
                const bullets = collectMonthlyBullets(rows, section.key);

                if (bullets.length === 0) {
                  return null;
                }

                return (
                  <Card key={section.key} className={cn("border p-5", section.boxClass)}>
                    <div className={cn("text-sm font-semibold", section.labelClass)}>
                      <span aria-hidden>{section.icon}</span> {section.title}
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {bullets.map((text, index) => (
                        <li
                          key={index}
                          className="flex gap-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#4a4160]"
                        >
                          <span aria-hidden className="shrink-0">•</span>
                          <span className="min-w-0">{text}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}

              {/* 날짜별 회고 history — 최신 날짜부터, 펼치면 반별 원문 (truncate 없음) */}
              <div>
                <h2 className="mb-2.5 text-base font-bold text-[#2b2323]">날짜별 회고</h2>
                <div className="space-y-2.5">
                  {dates.map((date) => {
                    const classes = sortedClassesOf(date);

                    return (
                      <details key={date} className="group rounded-2xl border border-[#f0e7e2] bg-white">
                        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 transition hover:bg-[#faf6f2] [&::-webkit-details-marker]:hidden">
                          <span className="font-semibold text-[#2d2928]">
                            {formatKoreanDate(date, true)}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs font-medium text-[#5c4ca8]">
                            {classes.length}개 반 · 펼쳐보기
                            <ChevronDown
                              className="h-3.5 w-3.5 transition group-open:rotate-180"
                              aria-hidden
                            />
                          </span>
                        </summary>

                        <div className="space-y-3 border-t border-dashed border-[#f0e3dc] px-4 py-3.5">
                          {classes.map(({ row, time, name }) => (
                            <div key={row.id}>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  {time ? (
                                    <span className="tabular-nums font-semibold text-[#6d5aa8]">
                                      {time}
                                    </span>
                                  ) : null}
                                  <span className="flex items-center gap-1 font-semibold text-[#2b2323]">
                                    <span aria-hidden>{groupIconOf(row.group?.icon ?? null)}</span>
                                    {name}
                                  </span>
                                </span>
                                <Link
                                  href={`/daily-logs/${row.id}`}
                                  className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-[#5c4ca8] hover:underline"
                                >
                                  일지 보기 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                </Link>
                              </div>

                              <div className="mt-2 grid gap-2 lg:grid-cols-3">
                                {SECTIONS.map((section) => {
                                  const value =
                                    section.key === "good"
                                      ? row.reflection_good
                                      : section.key === "hard"
                                        ? row.reflection_hard
                                        : row.reflection_next;

                                  // 비어 있는 항목은 숨긴다 (일간 회고와 동일 정책)
                                  if (!value) {
                                    return null;
                                  }

                                  return (
                                    <div
                                      key={section.key}
                                      className={cn(
                                        "rounded-2xl border px-3 py-2.5",
                                        section.boxClass,
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "text-[11px] font-semibold",
                                          section.labelClass,
                                        )}
                                      >
                                        {section.classLabel}
                                      </div>
                                      <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#4a4160]">
                                        {value}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
