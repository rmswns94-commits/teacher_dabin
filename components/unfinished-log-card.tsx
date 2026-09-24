"use client";

import Link from "next/link";
import { NotebookPen, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";

import { ExamPeriodMark } from "@/components/exam-period-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { autoFocusOccurrence, type CardOccurrenceTiming } from "@/lib/class-card-state";

// 수업 종료 후 미작성 수업일지 알림 — 오늘(KST) 요일 schedule이 있는 그룹 중
// "수업이 끝났는데(now >= endEpoch) 오늘 일지가 Finalized(completed)가 아닌" 것만 묶어 보여준다.
// - rows는 서버가 이미 가진 데이터(오늘 schedule + todayLogs batch)로 파생한 후보 전체이고
//   (completed는 서버에서 이미 제외), 종료 여부만 이 컴포넌트가 현재 시각으로 판정한다 —
//   페이지를 열어둔 채 수업이 끝나면 F5 없이 나타난다 (DB polling/refetch 0, local clock만).
// - Draft는 작성 완료가 아니다: 알림에 남고 버튼은 [이어쓰기]로 기존 draft를 연다.
//   일지가 없으면 [작성하기] — 두 목적지 모두 빠른 실행과 같은 canonical resolver 규칙
//   (일지 있으면 /daily-logs/{id}/edit, 없으면 /daily-logs/new?groupId&date) 재사용.
// - Todo/일지/알림 row를 만들지 않는 순수 derived 표시 — Finalized하면 자동으로 사라진다.
// - initialNow = 서버 렌더 시각 (hydration mismatch 방지, DashboardTodoCard와 같은 패턴).
export type UnfinishedLogRow = {
  groupId: string;
  groupName: string;
  examPeriod: boolean;
  // "HH:MM ~ HH:MM" — 하루 여러 slot이면 [가장 이른 시작 ~ 가장 늦은 종료] (일지는 그룹+날짜당 1개)
  timeLabel: string;
  // 오늘(KST) 이 그룹의 마지막 수업 종료 epoch — now >= endEpoch일 때만 표시
  endEpoch: number;
  href: string;
  actionLabel: "이어쓰기" | "작성하기";
};

export function UnfinishedLogCard({
  rows,
  initialNow,
  wrapUpOccurrences = [],
}: {
  rows: UnfinishedLogRow[];
  initialNow: number;
  // 오늘의 실제 수업 occurrence(시각만) — 수업 브리핑 카드와 같은 resolver(autoFocusOccurrence)로
  // "방금 끝난 가장 최근 수업"을 판정해, 그 수업의 마무리는 브리핑 카드가 primary로 맡고
  // 여기서는 중복 경고를 띄우지 않는다. 그보다 이전에 놓친 미작성 수업은 그대로 이 알림이 담당.
  wrapUpOccurrences?: CardOccurrenceTiming[];
}) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh(); // mount 직후 실제 브라우저 시각으로 동기화
    const interval = setInterval(refresh, 30_000);
    // iPad PWA background 복귀 시 stale 시각으로 잘못 판정하지 않게 즉시 재평가
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // 진행 중인 수업이 없고 오늘 끝난 수업이 있으면 그 마지막 수업이 브리핑 카드의 wrap-up 대상 —
  // 같은 화면에서 같은 수업을 두 번 경고하지 않는다 (진행 중인 수업이 있으면 primary가 브리핑이라 제외 없음)
  const primary = autoFocusOccurrence(wrapUpOccurrences, now);
  const primaryWrapUpGroupId = primary && now >= primary.endEpoch ? primary.groupId : null;
  const visible = rows.filter((row) => now >= row.endEpoch && row.groupId !== primaryWrapUpGroupId);

  if (visible.length === 0) {
    // 미작성 0개면 카드 자체를 렌더하지 않는다 ("없음" empty 카드 금지)
    return null;
  }

  return (
    <Card className="mt-4 rounded-3xl border-[#f0ddcb] bg-[#fffaf4] shadow-[0_2px_12px_rgba(90,70,120,0.06)]">
      <CardContent className="p-4">
        <div className="section-title flex items-center gap-1.5 text-[#a2643c]">
          <NotebookPen className="h-3.5 w-3.5" aria-hidden /> 마무리가 필요한 수업
          <span className="tabular-nums">· {visible.length}</span>
        </div>
        <p className="secondary-text mt-1 text-[#8a7b77]">
          수업이 끝났지만 아직 완료하지 않은 수업일지예요.
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {visible.map((row) => (
            <li
              key={row.groupId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-[#f3e7d8] bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="body-text flex flex-wrap items-center gap-1 font-medium text-[#2d2928]">
                  <span className="min-w-0 break-words">{row.groupName}</span>
                  <ExamPeriodMark show={row.examPeriod} className="text-xs" />
                </div>
                <div className="secondary-text tabular-nums text-[#8a7b77]">{row.timeLabel}</div>
              </div>
              <Button variant="secondary" size="sm" className="min-h-11 shrink-0 gap-1.5" asChild>
                <Link href={row.href}>
                  <PencilLine className="h-3.5 w-3.5" aria-hidden /> {row.actionLabel}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
