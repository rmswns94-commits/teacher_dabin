"use client";

import { useEffect } from "react";

// 정적 자산 캐시 + 오프라인 안내용 SW 등록. 실패해도 앱 동작에는 영향 없다.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("service worker registration failed", error);
    });
  }, []);

  return null;
}
