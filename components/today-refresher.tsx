"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

function kstToday() {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

// 오늘 할 일 페이지를 열어둔 채 자정이 지나거나(23:50→00:00),
// iPad PWA가 background였다가 복귀했을 때 새 날짜 기준으로 목록을 갱신한다.
// 세션/데이터는 건드리지 않고 router.refresh만 — signOut 같은 부작용 없음.
export function TodayRefresher() {
  const router = useRouter();
  const dayRef = useRef(kstToday());

  useEffect(() => {
    const refreshIfStale = () => {
      if (kstToday() !== dayRef.current) {
        dayRef.current = kstToday();
        router.refresh();
      }
    };
    const onWake = () => {
      refreshIfStale();
      // foreground 복귀 시 완료/삭제 반영도 최신화
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const interval = setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [router]);

  return null;
}
