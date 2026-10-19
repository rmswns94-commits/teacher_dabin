import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RetestAttemptHistory } from "@/components/retest-attempt-history";
import { RetestViewTabs } from "@/components/retest-view-tabs";
import { Card } from "@/components/ui/card";
import { ASSESSMENT_CATEGORIES } from "@/lib/assessments";
import { toDateString } from "@/lib/dates";
import { groupIconOf } from "@/lib/group-icons";
import { NO_GROUP_KEY, retestCategoryLabel, retestDateLabel, summarizeRetests } from "@/lib/retests";
import { getActiveRetestBoard, getPassedRetestHistory } from "@/lib/supabase/queries/retest-board";
import { RETEST_MIGRATION_MESSAGE } from "@/lib/supabase/queries/retests";

const HISTORY_PAGE = 30;

function MigrationNotice() {
  return (
    <Card className="p-5">
      <p className="secondary-text text-[#8a5d52]">{RETEST_MIGRATION_MESSAGE}</p>
    </Card>
  );
}

export default async function RetestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; n?: string }>;
}) {
  const { view, n } = (await searchParams) ?? {};
  const showHistory = view === "passed";

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto max-w-[1000px]">
          <PageHeader
            title="재시험 관리"
            description="수업일지에서 재시험이 필요하다고 표시한 학생을 반별로 모아서 확인해요."
          />
          <RetestViewTabs active={showHistory ? "passed" : "active"} />
          {showHistory ? <PassedHistory limit={Math.min(300, Math.max(HISTORY_PAGE, Number(n) || HISTORY_PAGE))} /> : <ActiveBoard />}
        </div>
      </main>
    </AppShell>
  );
}

async function ActiveBoard() {
  const { available, cards, hiddenArchivedCount } = await getActiveRetestBoard();
  if (!available) {
    return <MigrationNotice />;
  }

  return (
    <>
      {cards.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-base font-medium text-[#4d3a3a]">진행 중인 재시험이 없어요 ✨</p>
          <p className="secondary-text mt-1.5 text-[#8a7b77]">
            수업일지의 시험 결과에서 [재시험 필요]를 누르고 수업 기록을 완료하면 여기에 모여요.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-retest-group-cards>
          {cards.map((card) => {
            const summary = summarizeRetests(card.items);
            const name = card.group?.name ?? "반 정보 없음";
            return (
              <Link
                key={card.key}
                href={`/retests/${card.key}`}
                data-retest-group-card={card.key}
                className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c1e8]"
              >
                <Card className="h-full p-4 transition group-hover:border-[#d9c8f0]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-xl">{card.key === NO_GROUP_KEY ? "📁" : groupIconOf(card.group?.icon)}</span>
                    <span className="min-w-0 break-words text-base font-semibold text-[#2b2323]">{name}</span>
                    {card.group?.archived ? (
                      <span className="rounded-full bg-[#f2f0ee] px-2 py-0.5 text-xs text-[#7c6d69]">보관된 반</span>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-[#f8f6fc] px-3 py-2">
                      <dt className="text-xs text-[#8a7b77]">재시험 대상</dt>
                      <dd className="text-lg font-semibold tabular-nums text-[#2b2323]" data-retest-student-count>
                        {summary.studentCount}명
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-[#f8f6fc] px-3 py-2">
                      <dt className="text-xs text-[#8a7b77]">진행 중 재시험</dt>
                      <dd className="text-lg font-semibold tabular-nums text-[#5d4ba5]" data-retest-count>
                        {summary.retestCount}건
                      </dd>
                    </div>
                  </dl>
                  <p className="secondary-text mt-2.5 text-[#7c6d69]" data-retest-breakdown>
                    {ASSESSMENT_CATEGORIES.filter((meta) => summary.byCategory[meta.key] > 0)
                      .map((meta) => `${meta.label} ${summary.byCategory[meta.key]}`)
                      .join(" · ")}
                    {summary.failedCount > 0 ? ` · 미통과 ${summary.failedCount}` : ""}
                  </p>
                  <span className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[#5d4ba5]">
                    확인하기 <ChevronRight className="h-4 w-4" aria-hidden />
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {hiddenArchivedCount > 0 ? (
        <p className="secondary-text mt-4 text-[#8a7b77]">
          휴원·퇴원 학생의 진행 중 재시험 {hiddenArchivedCount}건은 목록에서 제외했어요. 기록은 지워지지 않아요.
        </p>
      ) : null}
    </>
  );
}

async function PassedHistory({ limit }: { limit: number }) {
  const { available, items, hasMore } = await getPassedRetestHistory(limit);
  if (!available) {
    return <MigrationNotice />;
  }
  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-base font-medium text-[#4d3a3a]">아직 통과한 재시험이 없어요.</p>
      </Card>
    );
  }

  return (
    <>
      <ul className="space-y-2" data-retest-history>
        {items.map((item) => (
          <li key={item.id} data-retest-history-item={item.id}>
            <Card className="p-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-[#f3eefc] px-2.5 py-0.5 text-sm font-semibold text-[#5d4ba5]">
                  {retestCategoryLabel(item.category)}
                </span>
                <span className="font-semibold text-[#2b2323]">{item.studentName}</span>
                <span className="secondary-text text-[#8a7b77]">{item.sourceGroupName ?? "반 정보 없음"}</span>
                <span className="ml-auto rounded-full bg-[#edf9f3] px-2.5 py-0.5 text-sm font-medium text-[#2f6d54]">
                  통과{item.passedAt ? ` ${retestDateLabel(toDateString(new Date(item.passedAt)))}` : ""}
                </span>
              </div>
              <p className="secondary-text mt-1.5 text-[#564d4d]">
                {retestDateLabel(item.classDate)} 수업 등록
                {item.correctCount !== null && item.totalQuestions ? ` · 기존 시험 ${item.correctCount} / ${item.totalQuestions}` : ""}
              </p>
              <p className="secondary-text mt-1 whitespace-pre-line break-words text-[#7c6d69]">
                {item.progress ?? "진도 정보 없음"}
              </p>
              {/* 통과 전 미통과 시도 이력 — 통과해도 지우거나 숨기지 않는다 */}
              {item.attempts.length > 0 ? (
                <div className="mt-2">
                  <RetestAttemptHistory attempts={item.attempts} />
                </div>
              ) : null}
              <p className="mt-2 text-sm font-medium text-[#2f6d54]" data-retest-final>
                최종 통과{item.passedAt ? ` · ${retestDateLabel(toDateString(new Date(item.passedAt)))}` : ""}
              </p>
            </Card>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div className="mt-4 text-center">
          <Link
            href={`/retests?view=passed&n=${limit + HISTORY_PAGE}`}
            scroll={false}
            className="inline-flex min-h-11 items-center rounded-xl border border-[#ece0db] bg-white px-4 text-sm font-medium text-[#564d4d] hover:bg-[#faf6f3]"
          >
            더 보기
          </Link>
        </div>
      ) : null}
    </>
  );
}
