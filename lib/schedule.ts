// Schedule math for weekly repeating classes.
// All wall-clock times are interpreted in APP_TIMEZONE (Asia/Seoul, fixed
// UTC+9, no DST), so absolute instants can be built with a constant offset.
// A future per-user timezone setting only needs to change these two constants.

export const APP_TIMEZONE = "Asia/Seoul";
export const APP_UTC_OFFSET = "+09:00";

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type ScheduleSlot = {
  id: string;
  group_id: string;
  day_of_week: number; // 0 = Sunday ... 6 = Saturday (JS Date.getDay())
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
};

export type ClassOccurrence<G> = {
  schedule: ScheduleSlot;
  group: G;
  date: string; // YYYY-MM-DD in APP_TIMEZONE
  daysFromNow: number;
  startEpoch: number;
  endEpoch: number;
};

export function formatTimeHM(time: string) {
  return time.slice(0, 5);
}

export function formatTimeRange(startTime: string, endTime: string) {
  return `${formatTimeHM(startTime)} ~ ${formatTimeHM(endTime)}`;
}

export function formatScheduleSlot(slot: Pick<ScheduleSlot, "day_of_week" | "start_time" | "end_time">) {
  return `${DAY_LABELS[slot.day_of_week]} ${formatTimeRange(slot.start_time, slot.end_time)}`;
}

// 표시용 요일 순서: 월화수목금토일
export const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const dayRank = new Map<number, number>(DAY_DISPLAY_ORDER.map((day, index) => [day, index]));

export function sortDays(days: number[]) {
  return [...days].sort((a, b) => (dayRank.get(a) ?? 9) - (dayRank.get(b) ?? 9));
}

export function formatDayList(days: number[]) {
  return sortDays(days)
    .map((day) => DAY_LABELS[day])
    .join(" · ");
}

export type GroupedScheduleBlock = {
  key: string;
  days: number[];
  startTime: string; // "HH:MM"
  endTime: string;
  slotIds: string[];
};

// 같은 시작~종료 시간의 요일별 schedule row들을 표시용 블록으로 묶는다.
// (DB는 요일별 row 그대로 — 이건 순수 view 유틸)
export function groupSchedulesByTime(
  slots: { id?: string; day_of_week: number; start_time: string; end_time: string }[],
): GroupedScheduleBlock[] {
  const map = new Map<string, GroupedScheduleBlock>();

  for (const slot of slots) {
    const startTime = formatTimeHM(slot.start_time);
    const endTime = formatTimeHM(slot.end_time);
    const key = `${startTime}-${endTime}`;
    const block = map.get(key) ?? { key, days: [], startTime, endTime, slotIds: [] };

    if (!block.days.includes(slot.day_of_week)) {
      block.days.push(slot.day_of_week);
    }

    if (slot.id) {
      block.slotIds.push(slot.id);
    }

    map.set(key, block);
  }

  return [...map.values()]
    .map((block) => ({ ...block, days: sortDays(block.days) }))
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        (dayRank.get(a.days[0]) ?? 9) - (dayRank.get(b.days[0]) ?? 9),
    );
}

export function formatScheduleBlock(block: Pick<GroupedScheduleBlock, "days" | "startTime" | "endTime">) {
  return `${formatDayList(block.days)} ${block.startTime} ~ ${block.endTime}`;
}

// Today's date parts as seen in APP_TIMEZONE, regardless of server timezone.
export function getAppTimezoneToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA gives YYYY-MM-DD

  return parts;
}

function addDays(ymd: string, days: number) {
  // Anchor at UTC noon so date arithmetic can never roll across a day boundary.
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOfWeekOf(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export function toEpoch(ymd: string, time: string) {
  return new Date(`${ymd}T${formatTimeHM(time)}:00${APP_UTC_OFFSET}`).getTime();
}

export type ScheduleOverview<G> = {
  current: ClassOccurrence<G> | null;
  next: ClassOccurrence<G> | null;
  nextAfter: ClassOccurrence<G> | null;
  endedToday: ClassOccurrence<G>[];
};

// Scans today plus the next `horizonDays` days of weekly repeats and returns
// the class in progress (if any), the next one, the one after that, and
// today's already-finished classes (for the "write your log" nudge).
export function getScheduleOverview<G>(
  slots: { schedule: ScheduleSlot; group: G }[],
  now = new Date(),
  horizonDays = 7,
): ScheduleOverview<G> {
  const nowEpoch = now.getTime();
  const today = getAppTimezoneToday(now);
  const occurrences: ClassOccurrence<G>[] = [];

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(today, offset);
    const dow = dayOfWeekOf(date);

    for (const { schedule, group } of slots) {
      if (schedule.day_of_week !== dow) {
        continue;
      }

      occurrences.push({
        schedule,
        group,
        date,
        daysFromNow: offset,
        startEpoch: toEpoch(date, schedule.start_time),
        endEpoch: toEpoch(date, schedule.end_time),
      });
    }
  }

  occurrences.sort((a, b) => a.startEpoch - b.startEpoch);

  const current = occurrences.find((occ) => occ.startEpoch <= nowEpoch && nowEpoch < occ.endEpoch) ?? null;
  const upcoming = occurrences.filter((occ) => occ.startEpoch > nowEpoch);
  const endedToday = occurrences.filter((occ) => occ.daysFromNow === 0 && occ.endEpoch <= nowEpoch);

  return {
    current,
    next: upcoming[0] ?? null,
    nextAfter: upcoming[1] ?? null,
    endedToday,
  };
}

export type GroupNextOccurrence = {
  isNow: boolean; // 지금 수업 중
  date: string; // YYYY-MM-DD (APP_TIMEZONE)
  daysFromNow: number;
  startTime: string; // "HH:MM"
  endTime: string;
  startEpoch: number;
  endEpoch: number;
};

// 그룹별 "지금 수업 중 또는 가장 가까운 다음 수업" 1건을 계산한다.
// schedule 전체를 한 번 받아 순수 계산만 하므로 그룹당 쿼리가 필요 없다.
export function getGroupNextOccurrences(
  slots: Pick<ScheduleSlot, "group_id" | "day_of_week" | "start_time" | "end_time">[],
  now = new Date(),
  horizonDays = 7,
): Map<string, GroupNextOccurrence> {
  const nowEpoch = now.getTime();
  const today = getAppTimezoneToday(now);
  const result = new Map<string, GroupNextOccurrence>();

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(today, offset);
    const dow = dayOfWeekOf(date);

    for (const slot of slots) {
      if (slot.day_of_week !== dow) {
        continue;
      }

      const startEpoch = toEpoch(date, slot.start_time);
      const endEpoch = toEpoch(date, slot.end_time);

      if (endEpoch <= nowEpoch) {
        continue; // 이미 끝난 수업
      }

      const occurrence: GroupNextOccurrence = {
        isNow: startEpoch <= nowEpoch && nowEpoch < endEpoch,
        date,
        daysFromNow: offset,
        startTime: formatTimeHM(slot.start_time),
        endTime: formatTimeHM(slot.end_time),
        startEpoch,
        endEpoch,
      };

      const existing = result.get(slot.group_id);

      // 수업 중 > 더 이른 시작 시각 순으로 그룹당 1건만 유지.
      if (
        !existing ||
        (occurrence.isNow && !existing.isNow) ||
        (occurrence.isNow === existing.isNow && occurrence.startEpoch < existing.startEpoch)
      ) {
        result.set(slot.group_id, occurrence);
      }
    }
  }

  return result;
}

// True when two time ranges on the same weekday overlap.
export function slotsOverlap(
  a: Pick<ScheduleSlot, "day_of_week" | "start_time" | "end_time">,
  b: Pick<ScheduleSlot, "day_of_week" | "start_time" | "end_time">,
) {
  if (a.day_of_week !== b.day_of_week) {
    return false;
  }

  return formatTimeHM(a.start_time) < formatTimeHM(b.end_time) &&
    formatTimeHM(b.start_time) < formatTimeHM(a.end_time);
}
