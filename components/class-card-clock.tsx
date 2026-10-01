"use client";

import { createContext, useContext, useEffect, useState } from "react";

// 수업 브리핑 카드(client shell)가 본문(서버가 미리 렌더한 ReactNode)에 현재 시각과 자동 focus occurrence를
// 전달하는 context — 본문 안의 client 컴포넌트(빠른 체크 등)가 "지금 수정 가능한 occurrence인가"를
// 카드와 같은 시각/판정으로 결정한다 (별도 타이머/DB 조회 없음).
export type ClassCardClock = { now: number; autoKey: string | null };

export const ClassCardClockContext = createContext<ClassCardClock | null>(null);

export function useClassCardClock() {
  return useContext(ClassCardClockContext);
}

// context 밖(hero 등)에서 쓰는 가벼운 local clock — 30초 tick + PWA 복귀/포커스 시 즉시 재평가 (카드와 같은 패턴)
export function useLocalClock(initialNow: number) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}
