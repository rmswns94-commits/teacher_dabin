import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { DailyLogStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import { getCurrentUserDailyLogs } from "@/lib/supabase/queries/daily-logs";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import type { DailyLogStatus } from "@/lib/supabase/types";

export default async function DailyLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; groupId?: string; status?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date : undefined;
  const groupId = params.groupId || undefined;
  const status = params.status === "draft" || params.status === "completed" ? (params.status as DailyLogStatus) : undefined;

  const [logs, groups] = await Promise.all([
    getCurrentUserDailyLogs({ date, groupId, status }),
    getCurrentUserGroups(),
  ]);

  const hasFilter = Boolean(date || groupId || status);

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="수업 일지"
          description="수업별 진도와 학생별 기록을 날짜·반별로 다시 볼 수 있어요."
          action={
            <Button className="gap-2" asChild>
              <Link href="/daily-logs/new">
                <Plus className="h-4 w-4" />
                오늘 수업 기록하기
              </Link>
            </Button>
          }
        />

        <Card className="mb-5">
          <CardContent className="py-4">
            <form action="/daily-logs" className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">날짜</span>
                <input
                  type="date"
                  name="date"
                  defaultValue={date ?? ""}
                  className="rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">수업 그룹</span>
                <select
                  name="groupId"
                  defaultValue={groupId ?? ""}
                  className="rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
                >
                  <option value="">전체</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#7c6d69]">상태</span>
                <select
                  name="status"
                  defaultValue={status ?? ""}
                  className="rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none"
                >
                  <option value="">전체</option>
                  <option value="draft">작성 중</option>
                  <option value="completed">작성 완료</option>
                </select>
              </label>

              <Button type="submit" variant="secondary" size="sm">
                필터 적용
              </Button>
              {hasFilter ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/daily-logs">전체 보기</Link>
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        {logs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-[#6652b9]" />
                {hasFilter
                  ? "조건에 맞는 수업 기록이 없어요."
                  : "아직 작성된 수업 기록이 없어요. 오늘 첫 기록을 남겨볼까요?"}
              </div>
              {!hasFilter ? (
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/daily-logs/new">오늘 수업 기록하기</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {logs.map((log) => (
              <Link key={log.id} href={`/daily-logs/${log.id}`}>
                <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(120,109,164,0.12)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#2b2323]">
                          {formatKoreanDate(log.class_date, true)}
                        </span>
                        <DailyLogStatusBadge status={log.status} />
                      </div>
                      <div className="mt-1 text-sm text-[#665b5a]">
                        {log.group?.name ?? "그룹 정보 없음"}
                        {log.title ? ` · ${log.title}` : ""}
                      </div>
                      {log.default_progress ? (
                        <div className="mt-1 text-xs text-[#8a7b77]">진도: {log.default_progress}</div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[#3d7f64]">
                        출석 {log.attendanceCounts.present}
                      </span>
                      <span className="rounded-full bg-[#fdf3e4] px-2 py-1 text-[#94702f]">
                        지각 {log.attendanceCounts.late}
                      </span>
                      <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[#a26660]">
                        결석 {log.attendanceCounts.absent}
                      </span>
                      <span className="text-[#8a7b77]">학생 {log.attendanceCounts.total}명</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
