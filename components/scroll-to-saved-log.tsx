"use client";

import { useEffect } from "react";

// [수업 기록 완료] 후 달력으로 돌아왔을 때(saved=1) 방금 저장한 일지 카드가
// 화면에 바로 보이도록 mount 시 한 번만 스크롤한다.
// 일반 날짜/카드 클릭 흐름에는 렌더되지 않아 관여하지 않는다.
export function ScrollToSavedLog({ logId }: { logId: string }) {
  useEffect(() => {
    // 페이지 페인트 이후에 실행해 레이아웃 확정 뒤 정확한 위치로 이동
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`log-card-${logId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [logId]);

  return null;
}
