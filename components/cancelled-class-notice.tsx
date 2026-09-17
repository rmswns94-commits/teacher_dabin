"use client";

import { useEffect, useState } from "react";

// 휴강 안내 — "원래 이 시간에 이 반 수업이 있었는데 오늘은 휴강"이라는 사실만 알린다.
//
// 실제 수업이 아니다: 타이머·진행률·빠른 실행이 붙지 않고, To Do 노출 window를 만들지도,
// 미작성 수업일지 알림을 만들지도 않는다. 순수 파생 표시라 DB row도 만들지 않는다.
//
// 표시 구간은 그 수업의 "원래 수업 시각" [시작, 종료)다. 종료 여부 판정은 이 컴포넌트가
// local clock으로 한다 — 페이지를 열어둔 채 시간이 지나면 F5 없이 사라진다
// (DB polling/refetch 0, UnfinishedLogCard와 같은 패턴).
export type CancelledClassRow = {
  groupId: string;
  groupName: string;
  groupIcon: string;
  timeLabel: string; // "17:00 ~ 18:30" (원래 수업 시각)
  startEpoch: number;
  endEpoch: number;
  reason: "cancelled" | "academy_closed" | "moved";
  // reason === "moved"일 때 옮겨간 날짜/시각 안내 문구 (구조화된 값에서 서버가 만든다)
  movedLabel: string | null;
};

export function CancelledClassNotice({
  rows,
  initialNow,
}: {
  rows: CancelledClassRow[];
  initialNow: number;
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

  // 지금이 원래 수업 시간인 것만 (지난 휴강·나중 휴강은 알리지 않는다)
  const visible = rows.filter((row) => now >= row.startEpoch && now < row.endEpoch);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2" aria-label="휴강 안내">
      {visible.map((row) => (
        <div
          key={`${row.groupId}-${row.startEpoch}`}
          aria-label={`${row.groupName} 휴강 안내`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-[#e8ddf3] bg-[#faf8ff] px-4 py-3"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="text-base leading-none">
              {row.groupIcon}
            </span>
            <span className="min-w-0 truncate font-semibold text-[#2d2928]">{row.groupName}</span>
          </span>

          <span className="font-medium text-[#5d4ba5]">
            {row.movedLabel ? `오늘 수업은 ${row.movedLabel}으로 변경됐어요` : "오늘은 휴강이에요 ☕"}
          </span>

          <span className="secondary-text tabular-nums text-[#8a7b77]">{row.timeLabel}</span>

          {row.reason === "academy_closed" ? (
            <span className="secondary-text rounded-full bg-[#fdf1e4] px-2 py-0.5 text-[#9a6234]">
              학원 휴강일
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
