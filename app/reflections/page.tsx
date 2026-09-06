import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import {
  getReflectionCounts,
  getReflectionLogs,
  type ReflectionLogRow,
} from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { cn } from "@/lib/utils";

const DEFAULT_LIMIT = 60;

function monthLabel(monthKey: string) {
  return `${monthKey.slice(0, 4)}년 ${Number(monthKey.slice(5, 7))}월`;
}

// 회고 세 항목의 라벨/색 — 일지 작성 폼·상세와 동일한 팔레트를 유지한다
const REFLECTION_FIELDS = [
  { key: "reflection_good", label: "잘된 점", labelClass: "text-[#3e7d6b]", boxClass: "border-[#dcebe2] bg-[#f6fbf8]" },
  { key: "reflection_hard", label: "아쉬웠던 점", labelClass: "text-[#8a5d52]", boxClass: "border-[#f0ded8] bg-[#fdf8f5]" },
  { key: "reflection_next", label: "다음에 다르게", labelClass: "text-[#5c4ca8]", boxClass: "border-[#e2d8f3] bg-[#faf7ff]" },
] as const;

export default async function ReflectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ group?: string; limit?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const limitParam = Number(params.limit);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 500) : DEFAULT_LIMIT;

  const today = todayDateString();
  const monthStart = `${today.slice(0, 7)}-01`;

  const groups = await getCurrentUserGroups();
  const selectedGroup = params.group
    ? groups.find((group) => group.id === params.group) ?? null
    : null;

  const [{ rows, hasMore, failed }, counts] = await Promise.all([
    getReflectionLogs({ groupId: selectedGroup?.id, limit }),
    getReflectionCounts(monthStart),
  ]);

  // 월별 타임라인 묶기 (rows는 이미 최신순)
  const byMonth = new Map<string, ReflectionLogRow[]>();
  for (const row of rows) {
    const key = row.class_date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }

  const filterHref = (groupId: string) => {
    const query = new URLSearchParams();
    if (groupId) query.set("group", groupId);
    const qs = query.toString();
    return qs ? `/reflections?${qs}` : "/reflections";
  };

  const moreHref = () => {
    const query = new URLSearchParams();
    if (selectedGroup) query.set("group", selectedGroup.id);
    query.set("limit", String(limit * 2));
    return `/reflections?${query.toString()}`;
  };

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <PageHeader
            title="✨ 수업 회고"
            description="수업 뒤에 남긴 한 줄들이 모여, 더 좋은 다음 수업이 돼요."
          />

          {/* 요약 스트립 — 쌓임 자체가 보이게 (랭킹/평가 아님) */}
          <Card className="mb-5 border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] via-[#f7f3fd] to-[#f1f7f3]">
            <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-5">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#4a3c6e]">
                <Sparkles className="h-4 w-4 text-[#8a6fc9]" aria-hidden />
                지금까지 쌓인 회고
              </span>
              <span className="text-2xl font-semibold tabular-nums tracking-[-0.03em] text-[#3d3450]">
                {counts.total}개
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs tabular-nums text-[#6d5aa8]">
                이번 달 {counts.thisMonth}개
              </span>
              <span className="basis-full text-xs leading-5 text-[#8a7fa8]">
                기록은 배신하지 않아요 — 돌아본 만큼 수업이 자라요.
              </span>
            </CardContent>
          </Card>

          {/* 반 필터 */}
          {groups.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Link
                href={filterHref("")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  !selectedGroup
                    ? "border-[#d3c8ec] bg-[#f2edf9] text-[#5c4ca8]"
                    : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                )}
              >
                전체
              </Link>
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={filterHref(group.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    selectedGroup?.id === group.id
                      ? "border-[#d3c8ec] bg-[#f2edf9] text-[#5c4ca8]"
                      : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                  )}
                >
                  <span aria-hidden>{groupIconOf(group.icon)}</span>
                  {group.name}
                </Link>
              ))}
            </div>
          ) : null}

          {failed ? (
            <Card>
              <CardContent className="p-6 text-sm text-[#655d5d]">
                수업 회고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm leading-6 text-[#655d5d]">
                아직 쌓인 수업 회고가 없어요 🌱
                <br />
                수업 일지 아래의 &quot;오늘 수업 회고&quot;에 한 줄씩 남겨보세요. 여기에 차곡차곡
                모여요.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6 pb-8">
              {[...byMonth.entries()].map(([monthKey, monthRows]) => (
                <section key={monthKey}>
                  <h2 className="mb-2.5 flex items-baseline gap-2 text-base font-bold text-[#3a2f2c]">
                    {monthLabel(monthKey)}
                    <span className="text-xs font-normal tabular-nums text-[#9a8b86]">
                      {monthRows.length}개
                    </span>
                  </h2>

                  <div className="space-y-3">
                    {monthRows.map((row) => (
                      <Card key={row.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#2b2323]">
                              {formatKoreanDate(row.class_date, true)}
                            </span>
                            {row.group ? (
                              <span className="flex items-center gap-1 rounded-full bg-[#f2edf9] px-2 py-0.5 text-[11px] text-[#5f54b8]">
                                <span aria-hidden>{groupIconOf(row.group.icon)}</span>
                                {row.group.name}
                              </span>
                            ) : null}
                          </div>
                          <Link
                            href={`/daily-logs/${row.id}`}
                            className="flex items-center gap-0.5 text-xs font-medium text-[#5c4ca8] hover:underline"
                          >
                            일지 보기 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </div>

                        <div className="mt-3 grid gap-2 lg:grid-cols-3">
                          {REFLECTION_FIELDS.map((field) => {
                            const value = row[field.key];

                            if (!value) {
                              return null;
                            }

                            return (
                              <div
                                key={field.key}
                                className={cn("rounded-2xl border px-3 py-2.5", field.boxClass)}
                              >
                                <div className={cn("text-[11px] font-semibold", field.labelClass)}>
                                  {field.label}
                                </div>
                                <div className="mt-1 whitespace-pre-line text-sm leading-6 text-[#4a4160]">
                                  {value}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}

              {hasMore ? (
                <div className="flex justify-center">
                  <Link
                    href={moreHref()}
                    className="rounded-full border border-[#ece0db] bg-white px-4 py-2 text-sm font-medium text-[#5c4ca8] transition hover:bg-[#faf6f3]"
                  >
                    지난 회고 더 보기
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
