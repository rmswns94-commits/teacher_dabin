import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LessonLogDetail } from "@/components/lesson-log-detail";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import {
  getDailyLogDetailForCurrentUser,
  getPraisesForDailyLog,
} from "@/lib/supabase/queries/daily-logs";

// 저장 직후 도착하는 수업 기록 상세.
// 캘린더 Master-Detail에서 기존 일지를 클릭했을 때와 동일한 공통 컴포넌트
// (LessonLogDetail)를 사용한다 — 두 화면의 정보 구조/UI가 항상 같게 유지된다.
// "저장했어요" 알림만 save redirect(?saved=1)일 때 한시적으로 표시한다.
export default async function DailyLogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = (await searchParams) ?? {};
  const [log, praiseRows] = await Promise.all([
    getDailyLogDetailForCurrentUser(id),
    getPraisesForDailyLog(id),
  ]);

  if (!log) {
    notFound();
  }

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title={`${formatKoreanDate(log.class_date, true)} · ${log.group?.name ?? "그룹 정보 없음"}`}
          description={log.title || "수업 기록 상세"}
          action={
            <Button variant="secondary" asChild>
              <Link href="/daily-logs">목록으로</Link>
            </Button>
          }
        />

        {saved ? (
          <div className="mb-5 rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-3 text-sm text-[#2f6d54]">
            수업 기록을 저장했어요.
          </div>
        ) : null}

        <div className="pb-8">
          <LessonLogDetail detail={log} timeRange={null} praises={praiseRows} />
        </div>
      </main>
    </AppShell>
  );
}
