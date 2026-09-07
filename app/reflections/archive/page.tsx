import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { monthLabel } from "@/lib/calendar";
import { formatKoreanDateFull } from "@/lib/dates";
import {
  aggregateByMonth,
  collectFrequentBullets,
} from "@/lib/reflection-archive";
import { getAllReflectionSlims } from "@/lib/supabase/queries/reflections";
import { cn } from "@/lib/utils";

// 전체 누적 회고 — 지금까지의 모든 수업 회고를 기간/통계/자주 적은 내용/월별 기록으로 훑는 페이지.
// 초기 로드는 텍스트+날짜 slim 쿼리 하나로 aggregate만 계산한다 (수백 개 원문을 DOM에 전부 내리지 않음
// — 원문 상세는 월별 기록 → 월 누적 상세의 날짜별 history 계층에서 본다).
// AI/한줄요약 없음: 완전 동일 문구의 빈도 기반 deterministic 정리(상위 8개)만 사용한다.

const SECTIONS = [
  {
    key: "good",
    icon: "✨",
    title: "꾸준히 잘된 점",
    labelClass: "text-[#3e7d6b]",
    boxClass: "border-[#dcebe2] bg-[#f6fbf8]",
  },
  {
    key: "hard",
    icon: "🌿",
    title: "반복해서 나타난 아쉬운 점",
    labelClass: "text-[#8a5d52]",
    boxClass: "border-[#f0ded8] bg-[#fdf8f5]",
  },
  {
    key: "next",
    icon: "💡",
    title: "다음엔 다르게",
    labelClass: "text-[#5c4ca8]",
    boxClass: "border-[#e2d8f3] bg-[#faf7ff]",
  },
] as const;

export default async function AllTimeReflectionsPage() {
  const result = await getAllReflectionSlims();
  const rows = result.rows; // class_date asc 정렬

  const dateCount = new Set(rows.map((row) => row.class_date)).size;
  const logCount = rows.length;
  const firstDate = rows[0]?.class_date ?? null;
  const lastDate = rows[rows.length - 1]?.class_date ?? null;
  const months = aggregateByMonth(rows); // 최신 월 desc — 쿼리 1번의 rows를 접은 것

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <PageHeader
            backHref="/reflections"
            title="전체 누적 회고"
            description="지금까지의 수업 회고를 돌아봐요."
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
                아직 누적된 수업 회고가 없어요.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5 pb-10">
              {/* 기간 + 기본 통계 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {firstDate && lastDate ? (
                  <span className="text-[#655d5d]">
                    {formatKoreanDateFull(firstDate)} ~ {formatKoreanDateFull(lastDate)}
                  </span>
                ) : null}
                <span className="rounded-full bg-[#efe8fb] px-2.5 py-1 text-xs font-medium tabular-nums text-[#5d4ba5]">
                  회고 작성일 {dateCount}일
                </span>
                <span className="rounded-full bg-[#e4f4ec] px-2.5 py-1 text-xs font-medium tabular-nums text-[#3d7f64]">
                  회고 수업 {logCount}개
                </span>
              </div>

              {/* 3개 누적 영역 — 완전 동일 문구 빈도순 상위 8개 (원문 그대로, 창작 없음) */}
              {SECTIONS.map((section) => {
                const bullets = collectFrequentBullets(rows, section.key);

                if (bullets.length === 0) {
                  return null;
                }

                return (
                  <Card key={section.key} className={cn("border p-5", section.boxClass)}>
                    <div className={cn("text-sm font-semibold", section.labelClass)}>
                      <span aria-hidden>{section.icon}</span> {section.title}
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {bullets.map((bullet, index) => (
                        <li
                          key={index}
                          className="flex gap-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#4a4160]"
                        >
                          <span aria-hidden className="shrink-0">•</span>
                          <span className="min-w-0">
                            {bullet.text}
                            {bullet.count > 1 ? (
                              <span className="ml-1.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[#8a7b77]">
                                ×{bullet.count}회
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2.5 text-[11px] text-[#a79996]">
                      자주 적은 내용부터 최대 8개 — 전체 원문은 아래 월별 기록에서 볼 수 있어요.
                    </p>
                  </Card>
                );
              })}

              {/* 월별 기록 — 최신 월부터, 클릭하면 월 누적 상세로 */}
              <div>
                <h2 className="mb-2.5 text-base font-bold text-[#2b2323]">월별 기록</h2>
                <div className="space-y-2.5">
                  {months.map((entry) => (
                    <Link
                      key={entry.month}
                      href={`/reflections/monthly?month=${entry.month}`}
                      className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#f0e7e2] bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:bg-[#faf6f2] hover:shadow-sm"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-[#2d2928]">
                          {monthLabel(entry.month)}
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-[#8a7b77]">
                          {entry.dateCount}일 · {entry.logCount}개 수업
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-[#5c4ca8]">
                        자세히 보기 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
