import type { PreparationItem } from "@/lib/supabase/types";

// 화면에 보여줄 준비 항목만 — dismissed tombstone(삭제된 linked 항목의 부활 억제용)은 제외.
// Dashboard / 오늘 할 일 / 그룹 상세 / 현황판 count가 전부 이 필터를 공유해야
// "삭제하면 모든 화면에서 사라진다"가 보장된다.
export function activePreparationItems(items: PreparationItem[] | null | undefined) {
  return (items ?? []).filter((item) => !item.dismissed);
}
