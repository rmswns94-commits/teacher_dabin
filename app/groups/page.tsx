import Link from "next/link";
import { Layers3, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GroupCreateForm } from "@/components/group-create-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingButton } from "@/components/pending-button";
import { getCurrentUserGroups, getGroupStudentCount } from "@/lib/supabase/queries/groups";
import { restoreGroupAction } from "./actions";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim();
  const allGroups = await getCurrentUserGroups(true);
  const groups = allGroups.filter((group) => !group.archived);
  const archivedGroups = allGroups.filter((group) => group.archived);
  const visibleGroups = groups.filter((group) =>
    !q || group.name.toLowerCase().includes(q.toLowerCase()),
  );
  const counts = await Promise.all(visibleGroups.map((group) => getGroupStudentCount(group.id)));

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title="수업 그룹"
          description="반별 학생을 편하게 관리해보세요."
          action={
            <Button asChild>
              <a href="#new-group">새 수업 그룹</a>
            </Button>
          }
        />

        <Card className="mb-5" id="new-group">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef5f0] text-[#3e7d6b]">
                <Layers3 className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-[#2d2424]">새 수업 그룹</div>
                <div className="text-xs text-[#7b6d6b]">학생 관리 흐름을 정리해보세요.</div>
              </div>
            </div>

            <GroupCreateForm />
          </CardContent>
        </Card>

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
            <CardContent className="p-6 text-sm text-[#655d5d]">
              {q ? "검색 결과가 없어요." : "아직 만든 수업 그룹이 없어요. 첫 번째 반을 만들어보세요."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleGroups.map((group, index) => (
              <Link key={group.id} href={`/groups/${group.id}`}>
                <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(120,109,164,0.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-[#2b2323]">{group.name}</div>
                    <span className="rounded-full bg-[#f2effc] px-2 py-1 text-[10px] text-[#5f54b8]">
                      {group.grade === "middle_1" ? "중1" : group.grade === "middle_2" ? "중2" : group.grade === "middle_3" ? "중3" : "고1"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-[#655d5d]">
                    <span>학생 수</span>
                    <strong>{counts[index]}명</strong>
                  </div>
                  <div className="mt-3 rounded-2xl bg-[#f8f3ef] p-3 text-sm text-[#564d4d]">
                    {group.memo || "등록된 메모가 아직 없어요."}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

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
                        {group.grade === "middle_1" ? "중1" : group.grade === "middle_2" ? "중2" : group.grade === "middle_3" ? "중3" : "고1"}
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
