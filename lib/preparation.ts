import type { PreparationItem } from "@/lib/supabase/types";

// 화면에 보여줄 준비 항목만 — dismissed tombstone(삭제된 linked 항목의 부활 억제용)은 제외.
// Dashboard / 오늘 할 일 / 그룹 상세 / 현황판 count가 전부 이 필터를 공유해야
// "삭제하면 모든 화면에서 사라진다"가 보장된다.
export function activePreparationItems(items: PreparationItem[] | null | undefined) {
  return (items ?? []).filter((item) => !item.dismissed);
}

// timestamptz(UTC ISO) → KST 달력 날짜. 완료일 판정은 반드시 Asia/Seoul 기준.
export function kstDateOfTimestamp(iso: string) {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}

// 오늘(KST) 완료한 항목인지 — legacy(completed=true, completedAt 없음)는 과거 완료 이력으로
// 취급해 false (임의 backfill 금지, 오늘 화면에 재노출하지 않는다).
export function isCompletedToday(item: PreparationItem, today: string) {
  return Boolean(item.completed && item.completedAt && kstDateOfTimestamp(item.completedAt) === today);
}
