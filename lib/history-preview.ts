// 이전 수업 기록 목록의 "최근 N개만 기본 표시" 프레젠테이션 규칙 (순수).
// 기존 resolver/ordering/renderer는 그대로 두고, 이미 로드된 canonical 목록의
// 앞 RECENT_VISIBLE_COUNT개만 기본으로 보여주는 slice 계산만 담당한다.
// showOlder는 UI-only state — draft/final payload/DB와 무관하다.

export const RECENT_VISIBLE_COUNT = 3;

export function historyPreview(totalLoaded: number, showOlder: boolean) {
  const olderCount = Math.max(0, totalLoaded - RECENT_VISIBLE_COUNT);
  return {
    // 3개 이하면 전부, 4개 이상이면 접힘 시 3개만
    visibleCount: showOlder || olderCount === 0 ? totalLoaded : RECENT_VISIBLE_COUNT,
    // 접힘 상태에서 숨겨진(로드된) 기록 수 — 펴기 버튼 라벨용
    hiddenCount: showOlder ? 0 : olderCount,
    showExpand: !showOlder && olderCount > 0,
    showCollapse: showOlder && olderCount > 0,
  };
}
