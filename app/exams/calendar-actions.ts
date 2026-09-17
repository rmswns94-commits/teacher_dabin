"use server";

import { monthRange, parseMonthParam } from "@/lib/calendar";
import { getRedDatesInRange } from "@/lib/red-dates";

// 시험 대비 플래너는 client에서 달을 넘기므로, 보이는 달의 "빨간 날짜"만 그때 한 번 읽는다.
// 달마다 1회 batch 조회이고 client가 이미 읽은 달은 다시 묻지 않는다 — 날짜 칸별 조회(N+1) 없음.
// 순수 조회다: 계획/시험/할 일 데이터는 아무것도 바뀌지 않는다.
export async function getMonthRedDatesAction(month: string): Promise<string[]> {
  const safeMonth = parseMonthParam(month, "");

  if (!safeMonth) {
    return [];
  }

  const range = monthRange(safeMonth);

  try {
    return await getRedDatesInRange(range.start, range.end);
  } catch {
    // 조회 실패는 "빨간 날짜 없음"으로 둔다 — 캘린더는 기존과 동일하게 그대로 보인다
    return [];
  }
}
