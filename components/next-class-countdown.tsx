"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  className,
}: {
  startEpoch: number;
  endEpoch: number;
  className?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [initialPhase] = useState<Phase>(() => phaseOf(startEpoch, endEpoch, Date.now()));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phaseOf(startEpoch, endEpoch, now) !== initialPhase) {
      router.refresh();
    }
  }, [now, startEpoch, endEpoch, initialPhase, router]);

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
