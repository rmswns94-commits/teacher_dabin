"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "upcoming" | "current" | "ended";

function phaseOf(startEpoch: number, endEpoch: number, now: number): Phase {
  if (now < startEpoch) {
    return "upcoming";
  }

  return now < endEpoch ? "current" : "ended";
}

function label(startEpoch: number, endEpoch: number, now: number) {
  const phase = phaseOf(startEpoch, endEpoch, now);

  if (phase === "current") {
    return "수업 중";
  }

  if (phase === "ended") {
    return "수업이 끝났어요";
  }

  const totalMinutes = Math.max(1, Math.ceil((startEpoch - now) / 60000));

  if (totalMinutes <= 30) {
    return `곧 시작해요 · ${totalMinutes}분 후`;
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}분 후 시작`;
  }

  if (totalMinutes < 60 * 24) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}시간 ${minutes}분 후 시작` : `${hours}시간 후 시작`;
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  return `${days}일 후`;
}

// Live "N분 후 시작 / 수업 중" text. Only the clock math runs on the client;
// when the phase flips (class starts or ends) the server data is refreshed
// once so the dashboard swaps to the next class without manual reload.
export function NextClassCountdown({
  startEpoch,
  endEpoch,
  initialNow,
  className,
}: {
  startEpoch: number;
  endEpoch: number;
  // 서버 렌더 시각 — hydration mismatch 방지용 (mount 직후 실제 시각으로 동기화)
  initialNow: number;
  className?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(initialNow);
  // 기준 phase는 ref로 관리한다. router.refresh()는 컴포넌트를 remount하지 않아
  // useState 초기값이 다시 계산되지 않으므로, state로 두면 수업 전환 후
  // "phase 불일치 → 30초마다 영구 refresh" 루프가 생긴다 (실제 있었던 버그).
  const baseRef = useRef<{ slotKey: string; phase: Phase } | null>(null);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh(); // mount 직후 실제 브라우저 시각으로 동기화 (초기값은 서버 렌더 시각)
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const slotKey = `${startEpoch}:${endEpoch}`;
    const phase = phaseOf(startEpoch, endEpoch, now);

    // 첫 평가이거나 서버가 다음 수업으로 교체한 경우(slot 변경) → 기준만 재설정
    if (!baseRef.current || baseRef.current.slotKey !== slotKey) {
      baseRef.current = { slotKey, phase };
      return;
    }

    // 같은 slot에서 phase가 실제로 전환된 순간에만, 전환당 1회 refresh
    if (baseRef.current.phase !== phase) {
      baseRef.current = { slotKey, phase };
      router.refresh();
    }
  }, [now, startEpoch, endEpoch, router]);

  const phase = phaseOf(startEpoch, endEpoch, now);
  const soon = phase === "upcoming" && startEpoch - now <= 30 * 60000;

  return (
    <span
      className={
        className ??
        (phase === "current"
          ? "inline-flex items-center rounded-full bg-[#edf9f3] px-2.5 py-1 text-xs font-medium text-[#2f6d54]"
          : soon
            ? "inline-flex items-center rounded-full bg-[#fdf3e4] px-2.5 py-1 text-xs font-medium text-[#8a6828]"
            : "inline-flex items-center rounded-full bg-[#f3eefc] px-2.5 py-1 text-xs font-medium text-[#5d4eb2]")
      }
    >
      {label(startEpoch, endEpoch, now)}
    </span>
  );
}
