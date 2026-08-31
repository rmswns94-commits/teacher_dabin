import Link from "next/link";
import { Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GroupCreateDialog } from "@/components/group-create-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingButton } from "@/components/pending-button";
import { formatGrade } from "@/lib/grades";
import { formatScheduleSlot } from "@/lib/schedule";
import { getAllGroupStudentCounts, getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { restoreGroupAction } from "./actions";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim();
  const [allGroups, counts, schedules] = await Promise.all([
    getCurrentUserGroups(true),
    getAllGroupStudentCounts(),
    getCurrentUserSchedulesWithGroup(),
  ]);

  const schedulesByGroup = new Map<string, string[]>();
  for (const slot of schedules) {
    schedulesByGroup.set(slot.group_id, [
      ...(schedulesByGroup.get(slot.group_id) ?? []),
      formatScheduleSlot(slot),
    ]);
  }
  const groups = allGroups.filter((group) => !group.archived);
  const archivedGroups = allGroups.filter((group) => group.archived);
  const visibleGroups = groups.filter((group) =>
    !q || group.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader title="수업 그룹" description="수업 중인 반을 한눈에 확인해요." />

        <Card className="mb-5">
          <CardContent className="py-4">
            <form action="/groups" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6f0fb] text-[#5e4eb5]">
                <Search className="h-4 w-4" />
              </div>
              <input
                defaultValue={q}
                name="q"
                className="flex-1 border-none bg-transparent text-sm text-[#433d3d] outline-none placeholder:text-[#9b8e8a]"
                placeholder="그룹 이름 검색"
              />
              <Button type="submit" variant="secondary" size="sm">
                검색
              </Button>
              {q ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/groups">전체 보기</Link>
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        {visibleGroups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#655d5d]">
              {q ? (
                "검색 결과가 없어요."
              ) : (
                <>
                  아직 등록된 수업 그룹이 없어요. 먼저 수업 그룹을 만들어볼까요? 🌱
                  <GroupCreateDialog label="첫 수업 그룹 등록하기" />
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleGroups.map((group) => {
              const groupTimes = schedulesByGroup.get(group.id) ?? [];
              const textbooks = (group.textbook ?? "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);

              return (
                <Link key={group.id} href={`/groups/${group.id}`}>
                  <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(120,109,164,0.12)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold text-[#2b2323]">{group.name}</div>
                      <span className="rounded-full bg-[#f2effc] px-2 py-1 text-[10px] text-[#5f54b8]">
                        {formatGrade(group.grade)}
                      </span>
                    </div>

                    {groupTimes.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {groupTimes.slice(0, 3).map((time) => (
                          <span
                            key={time}
                            className="rounded-full bg-[#f5f1fb] px-2 py-0.5 text-[11px] tabular-nums text-[#5f54b8]"
                          >
                            {time}
                          </span>
                        ))}
                        {groupTimes.length > 3 ? (
                          <span className="text-[11px] text-[#a08d97]">외 {groupTimes.length - 3}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-[#a89a95]">수업 시간 미등록</div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-sm text-[#655d5d]">
                      <span>학생 {counts.get(group.id) ?? 0}명</span>
                      <span className="max-w-[55%] truncate text-xs text-[#8a7b77]">
                        {textbooks.length > 0
                          ? `${textbooks[0]}${textbooks.length > 1 ? ` 외 ${textbooks.length - 1}권` : ""}`
                          : "교재 미등록"}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {visibleGroups.length > 0 ? (
          <div className="mt-6 flex justify-end">
            <GroupCreateDialog />
          </div>
        ) : null}

        {archivedGroups.length > 0 ? (
          <details className="mt-8 pb-8">
            <summary className="cursor-pointer text-sm font-medium text-[#756a67]">
              보관된 그룹 {archivedGroups.length}개 보기
            </summary>
            <div className="mt-4 grid gap-3">
              {archivedGroups.map((group) => (
                <Card key={group.id} className="p-4 opacity-80">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-[#2b2323]">{group.name}</div>
                      <div className="mt-0.5 text-xs text-[#8a7b77]">
                        {formatGrade(group.grade)}
                        {group.memo ? ` · ${group.memo}` : ""}
                      </div>
                    </div>
                    <form action={restoreGroupAction.bind(null, group.id)}>
                      <PendingButton variant="secondary" size="sm" pendingText="복원 중...">
                        복원
                      </PendingButton>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          </details>
        ) : null}
      </main>
    </AppShell>
  );
}
