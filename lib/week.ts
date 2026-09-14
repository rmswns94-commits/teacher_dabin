// 편의성 PHASE 4 — 주간 일정 view의 순수 날짜/projection helper.
// 주간 화면은 기존 데이터(Group schedule/보충/시험/숙제/할 일)의 read-only projection이다 —
// 어떤 일정 row도 새로 만들지 않고, 여기 helper들은 DB를 모른다 (pure, 테스트 대상).

import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";

export type WeekRange = {
  start: string; // 월요일 (KST date-only)
  end: string; // 일요일
  days: string[]; // 월~일 7일
};

// 기준일이 포함된 KST 월~일 주간. 일요일(dayOfWeekOf=0)도 그 주의 월요일로 돌아간다
// (다음 주 월요일이 아니라). 날짜 연산은 기존 addDaysStr(UTC 정오 anchor)라 경계 안전.
export function getKstWeekRange(baseDate: string): WeekRange {
  const dow = dayOfWeekOf(baseDate); // 0=일 … 6=토
  const start = addDaysStr(baseDate, -((dow + 6) % 7));
  return {
    start,
    end: addDaysStr(start, 6),
    days: Array.from({ length: 7 }, (_, index) => addDaysStr(start, index)),
  };
}

export type WeekScheduleSlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

// 반복 Group schedule을 주간 7일에 UI로만 파생한다 — "9/14 6교시" instance row를
// DB에 만들지 않는다. 같은 날짜 안에서는 시작 시간 ASC, 같으면 그룹 이름 순.
export function projectSchedulesIntoWeek<G extends { name: string }>(
  slots: readonly { schedule: WeekScheduleSlot; group: G }[],
  days: readonly string[],
): Map<string, { schedule: WeekScheduleSlot; group: G }[]> {
  const byDate = new Map<string, { schedule: WeekScheduleSlot; group: G }[]>();
  for (const date of days) {
    const dow = dayOfWeekOf(date);
    const items = slots
      .filter((slot) => slot.schedule.day_of_week === dow)
      .sort(
        (a, b) =>
          a.schedule.start_time.localeCompare(b.schedule.start_time) ||
          a.group.name.localeCompare(b.group.name, "ko"),
      );
    if (items.length > 0) {
      byDate.set(date, items);
    }
  }
  return byDate;
}

// due_date 기반 항목(숙제/할 일)을 날짜별로 묶는다 — 원래 due_date에만 위치시킨다.
// carry-forward(오늘 할 일의 이월 표시)는 여기 존재하지 않는다: 주간 화면은 일정/마감일
// 관점이고, undated(null/빈 날짜) 항목은 날짜를 추측하지 않고 제외한다.
export function groupByDueDate<T>(
  items: readonly T[],
  dueDateOf: (item: T) => string | null | undefined,
  days: readonly string[],
): Map<string, T[]> {
  const daySet = new Set(days);
  const byDate = new Map<string, T[]>();
  for (const item of items) {
    const date = dueDateOf(item);
    if (!date || !daySet.has(date)) {
      continue;
    }
    byDate.set(date, [...(byDate.get(date) ?? []), item]);
  }
  return byDate;
}
