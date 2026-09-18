import type { ScheduleExceptionKind } from "@/lib/schedule-exceptions";

// 공휴일 일괄 변경의 대상 판정 — 서버 action과 화면이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
//
// 대상은 "공휴일 때문에만 쉬는 정규 occurrence"뿐이다:
// - 예외가 없는 occurrence  → 공휴일 기본 휴강 상태 → [전체 정상 수업날로 변경] 대상
// - kind='holiday_class'    → 이미 켜 둔 정상 수업 → [전체 공휴일 처리] 대상
// - cancelled / moved / time_override → 사용자가 따로 설정한 상태라 어느 쪽 대상도 아니다
//   (개별 휴강을 지우거나, 다른 날짜로 옮긴 수업을 되살리지 않는다)
// 보강·옮겨온 수업 같은 1회성 수업은 애초에 반복 시간표에서 나오지 않아 목록에 없다.

export type HolidayBulkItem = {
  exceptionKind: ScheduleExceptionKind | null;
  // 그날 이 반에 이미 다른 실제 수업(보강·옮겨온 수업)이 있으면 정상 수업으로 되살리지 않는다 —
  // 수업일지가 반·날짜마다 하나라 두 수업을 따로 기록할 수 없기 때문이다.
  blockedByOtherClass?: boolean;
};

export function selectHolidayBulkTargets<T extends HolidayBulkItem>(items: readonly T[], enabled: boolean) {
  return enabled
    ? items.filter((item) => item.exceptionKind === null && !item.blockedByOtherClass)
    : items.filter((item) => item.exceptionKind === "holiday_class");
}

export type HolidayBulkSummary = {
  // 지금 누르면 어느 방향으로 바뀌는지 — 하나라도 휴강이 남아 있으면 "전체 정상 수업"이 먼저다
  mode: "enable" | "disable";
  count: number;
  // 대상이 하나뿐이면 바로 위 개별 버튼과 같은 일을 해서 보여주지 않는다
  show: boolean;
};

export function summarizeHolidayBulk(items: readonly HolidayBulkItem[]): HolidayBulkSummary {
  const pending = selectHolidayBulkTargets(items, true).length;
  const overrides = selectHolidayBulkTargets(items, false).length;
  const mode = pending > 0 ? "enable" : "disable";
  const count = mode === "enable" ? pending : overrides;

  return { mode, count, show: pending + overrides >= 2 && count > 0 };
}
