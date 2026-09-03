"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const KEY = "dabin-nav-depth";

// 앱 내부 이동 깊이를 세션 단위로 기록한다 (뒤로가기 버튼의 back/fallback 판단용).
// history.length만으로는 직전 페이지가 앱 내부라는 보장이 없어서,
// 같은 탭에서 앱 내부를 실제로 이동한 횟수를 sessionStorage로 센다.
// 외부 사이트를 거쳐 다시 들어온 새 document 로드면 카운터를 리셋한다.
export function NavHistoryTracker() {
  const pathname = usePathname();
  const initializedRef = useRef(false);

  // dev 전용 진단: iPad에서 "새로고침된 것 같다"가 실제 document reload인지,
  // bfcache 복원인지 콘솔에서 구분할 수 있게 한다 (production 미노출).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined;
    console.info(`[dabin] document load: ${nav?.type ?? "unknown"}`);
    const onPageShow = (event: PageTransitionEvent) => {
      console.info(`[dabin] pageshow (bfcache 복원=${event.persisted})`);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    try {
      if (!initializedRef.current) {
        initializedRef.current = true;
        const referrer = document.referrer;
        if (!referrer || !referrer.startsWith(window.location.origin)) {
          sessionStorage.setItem(KEY, "0");
        }
      }
      const depth = Number(sessionStorage.getItem(KEY) ?? "0") + 1;
      sessionStorage.setItem(KEY, String(depth));
    } catch {
      // storage 접근 불가 환경에서는 fallback 이동만 사용된다
    }
  }, [pathname]);

  return null;
}

// 앱 내부에서 이전 화면이 존재하는지 (뒤로가기 클릭 시점에 호출)
export function hasInternalHistory() {
  try {
    return Number(sessionStorage.getItem(KEY) ?? "0") > 1 && window.history.length > 1;
  } catch {
    return false;
  }
}
