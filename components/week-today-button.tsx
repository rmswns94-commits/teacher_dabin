"use client";

// 주간 view [오늘로 이동] — 기존 [이번 주] 버튼을 rename/확장한 것 (항상 표시).
// - 현재 주를 보는 중: 페이지 이동 없이 오늘 요일 섹션(#week-day-오늘)으로 1회 scroll.
// - 다른 주를 보는 중: 현재 주(/week)로 전환한 뒤, 새 주가 실제로 렌더된 다음 1회만 scroll.
//   pending 플래그를 sessionStorage에 두고 remount된 effect에서 소비(consume-once)하므로
//   render race(전환 전 scroll 시도)와 반복 auto-scroll(새로고침/뒤로가기 재발동)이 없다 —
//   자동 scroll은 오직 이 버튼 클릭 직후 1회뿐이다.
// - 스크롤 컨테이너는 window가 아니라 main(overflow-y-auto)이지만 scrollIntoView는
//   가장 가까운 scrollable ancestor를 스크롤하므로 그대로 동작한다.
// - reduced-motion 환경에서는 smooth 대신 auto로 즉시 이동한다.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const PENDING_KEY = "week-scroll-today";
// 주 전환 navigation이 중단된 채 남은 stale 플래그가 한참 뒤에 발동하지 않도록 하는 유효 시간
const PENDING_MAX_AGE_MS = 15_000;

function scrollToDay(date: string) {
  const target = document.getElementById(`week-day-${date}`);
  if (!target) {
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export function WeekTodayButton({
  isCurrentWeek,
  today,
}: {
  isCurrentWeek: boolean;
  today: string; // KST 오늘 (서버 todayDateString과 동일 소스)
}) {
  const router = useRouter();

  // 다른 주에서 눌러 전환된 직후의 1회 scroll — 플래그가 있을 때만, 읽는 즉시 제거.
  useEffect(() => {
    if (!isCurrentWeek) {
      return;
    }
    let pendingAt = 0;
    try {
      pendingAt = Number(sessionStorage.getItem(PENDING_KEY) ?? 0);
      if (pendingAt > 0) {
        sessionStorage.removeItem(PENDING_KEY);
      }
    } catch {
      // sessionStorage 차단 환경 — scroll 없이 주 전환만으로 동작 (기능 저하만)
    }
    if (pendingAt <= 0 || Date.now() - pendingAt > PENDING_MAX_AGE_MS) {
      return;
    }
    // DOM commit 이후 한 프레임 뒤에 실행 — 새 주 섹션이 배치된 다음의 안전한 시점
    const frame = requestAnimationFrame(() => {
      scrollToDay(today);
    });
    return () => cancelAnimationFrame(frame);
  }, [isCurrentWeek, today]);

  const handleClick = () => {
    if (isCurrentWeek) {
      scrollToDay(today);
      return;
    }
    try {
      sessionStorage.setItem(PENDING_KEY, String(Date.now()));
    } catch {
      // 저장 실패 시에도 주 전환은 진행 (scroll만 생략)
    }
    router.push("/week");
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      오늘로 이동
    </Button>
  );
}
