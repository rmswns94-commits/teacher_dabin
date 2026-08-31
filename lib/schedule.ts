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
