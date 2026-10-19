import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RetestGroupBoard } from "@/components/retest-group-board";
import { Card } from "@/components/ui/card";
import { todayDateString } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import { NO_GROUP_KEY } from "@/lib/retests";
import { getGroupRetestBoard } from "@/lib/supabase/queries/retest-board";
import { RETEST_MIGRATION_MESSAGE } from "@/lib/supabase/queries/retests";

export default async function RetestGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (groupId !== NO_GROUP_KEY && !/^[0-9a-f-]{36}$/i.test(groupId)) {
    notFound();
  }
  const board = await getGroupRetestBoard(groupId);
  if (!board) {
    notFound();
  }
  const title = board.group ? `${groupIconOf(board.group.icon)} ${board.group.name}` : "반 정보 없음";

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto max-w-[1000px]">
          <PageHeader title={title} description="재시험 관리" backHref="/retests" />
          {board.available ? (
            // 낙관적 state는 board 안에 있다 — 통과/미통과 직후 서버가 다시 그려도(revalidate) 같은 결과라
            // remount하지 않는다 (filter/toast 유지). 다시 방문하면 새 목록으로 시작한다.
            <RetestGroupBoard
              items={board.items}
              studentOrder={board.studentOrder}
              today={todayDateString()}
            />
          ) : (
            <Card className="p-5">
              <p className="secondary-text text-[#8a5d52]">{RETEST_MIGRATION_MESSAGE}</p>
            </Card>
          )}
        </div>
      </main>
    </AppShell>
  );
}
