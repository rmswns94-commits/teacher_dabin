"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

// CURRENT CLASS 카드 우측의 남은 수업 시간 블록.
// 분 단위 표시만 필요하므로 30초 간격으로 현재 시각 state만 갱신한다
// (router.refresh/DB 조회 없음 — 카드 전환은 기존 NextClassCountdown의 phase 로직이 담당).
export function CurrentClassRemaining({
  startEpoch,
  endEpoch,
}: {
  startEpoch: number;
  endEpoch: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // 진행 중일 때만 표시 (시작 전/종료 후에는 기존 카드 상태 전환을 따른다)
  if (now < startEpoch || now >= endEpoch) {
    return null;
  }

  const remainingMinutes = Math.max(1, Math.ceil((endEpoch - now) / 60_000));
  const totalMinutes = Math.max(1, Math.round((endEpoch - startEpoch) / 60_000));
  const progress = Math.min(100, Math.max(0, ((now - startEpoch) / (endEpoch - startEpoch)) * 100));

  const endKst = new Date(endEpoch + 9 * 3_600_000);
  const endLabel = `${String(endKst.getUTCHours()).padStart(2, "0")}:${String(
    endKst.getUTCMinutes(),
  ).padStart(2, "0")}`;

  const almostOver = remainingMinutes <= 10;

  return (
    <div className="w-full min-w-[176px] rounded-2xl border border-[#e2d8f3] bg-white/70 px-4 py-3.5 shadow-sm backdrop-blur-sm sm:w-auto">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7fb8]">
        <Hourglass className="h-3.5 w-3.5" aria-hidden />
        남은 수업 시간
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums tracking-[-0.02em] text-[#3d3450]">
          {remainingMinutes}
        </span>
        <span className="text-base font-semibold text-[#3d3450]">분</span>
        {almostOver ? (
          <span className="ml-1 rounded-full bg-[#fdf3e4] px-2 py-0.5 text-[11px] font-medium text-[#94702f]">
            곧 끝나요
          </span>
        ) : null}
      </div>

      <div className="mt-1 text-xs tabular-nums text-[#8a7b77]">{endLabel} 종료 예정</div>

      {/* 얇은 진행률 바 — 전체 수업 시간 대비 경과 비율 */}
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#efe9f9]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#b3a5ec] to-[#9dd4bd] transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] tabular-nums text-[#a79bc4]">
        {totalMinutes - remainingMinutes} / {totalMinutes}분 진행
      </div>
    </div>
  );
}
