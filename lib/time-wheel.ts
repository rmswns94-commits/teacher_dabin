// 시/분 2열 시간 선택의 규칙 — 화면과 테스트가 같은 함수를 쓴다.
//
// - 값은 언제나 "HH:MM" 문자열이다. Date 객체로 바꾸지 않는다 (timezone과 무관한 시각 표기).
// - 수업/일정 시간은 08:00~22:00, 5분 단위다. 종료 시간만 22:00을 쓸 수 있고 22시의 분은 00뿐이다.
// - 이미 저장된 값(07:30, 17:03, 22:30 …)은 절대 바꾸지 않는다 — 목록에 그 값을 그대로 끼워 넣어
//   화면에서 잃어버리지 않게 하고, 사용자가 새로 고르는 순간부터만 허용 범위가 적용된다.

// 수업/일정 시간의 경계 (둘 다 포함)
export const CLASS_MIN_HOUR = 8;
export const CLASS_MAX_HOUR = 22; // 종료 전용 — 시작은 21시까지

export const MINUTE_STEP = 5;
export const MINUTE_OPTIONS = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
  String(index * MINUTE_STEP).padStart(2, "0"),
);

// start = 수업 시작 시간, end = 종료 시간, any = 제한 없음(상담 시간 등 수업이 아닌 입력)
export type TimeBound = "start" | "end" | "any";

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// "HH:MM" 또는 "HH:MM:SS" → { hour, minute } (형식이 아니면 null)
export function splitTime(value: string | null | undefined) {
  const text = (value ?? "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(text)) {
    return null;
  }
  return { hour: text.slice(0, 2), minute: text.slice(3, 5) };
}

export function joinTime(hour: string, minute: string) {
  return `${hour}:${minute}`;
}

function boundHours(bound: TimeBound) {
  if (bound === "any") {
    return Array.from({ length: 24 }, (_, index) => pad2(index));
  }

  const last = bound === "end" ? CLASS_MAX_HOUR : CLASS_MAX_HOUR - 1;
  return Array.from({ length: last - CLASS_MIN_HOUR + 1 }, (_, index) => pad2(CLASS_MIN_HOUR + index));
}

// 시 목록. minTime(이 시각보다 뒤여야 함)이 있으면 그 이전 시는 아예 보여주지 않는다.
// current(현재 값)가 범위 밖이면 그 시를 목록에 끼워 넣는다 — 기존 기록을 화면에서 잃지 않기 위해서다.
export function hourOptions(input: {
  bound: TimeBound;
  minTime?: string | null;
  current?: string | null;
}) {
  const min = splitTime(input.minTime);
  let hours = boundHours(input.bound);

  if (min) {
    hours = hours.filter((hour) => hour >= min.hour);
    // 시작과 같은 시에 남은 분이 없으면(예: 21:55 시작) 그 시는 고를 수 없다
    if (hours[0] === min.hour && minuteOptionsFor(min.hour, input.bound, min.minute).length === 0) {
      hours = hours.slice(1);
    }
  }

  const currentParts = splitTime(input.current);
  if (currentParts && !hours.includes(currentParts.hour)) {
    // 이미 저장된 시각은 범위 밖이어도 보여준다 (자동 보정 금지)
    const keep = !min || currentParts.hour >= min.hour;
    if (keep) {
      hours = [...hours, currentParts.hour].sort();
    }
  }

  return hours;
}

function minuteOptionsFor(hour: string, bound: TimeBound, afterMinute?: string) {
  // 22시는 종료 시간에서만, 그것도 정각만 쓸 수 있다
  const base =
    bound !== "any" && Number(hour) === CLASS_MAX_HOUR ? ["00"] : MINUTE_OPTIONS;

  return afterMinute === undefined ? base : base.filter((minute) => minute > afterMinute);
}

// 고른 시에 대한 분 목록. minTime과 같은 시라면 그 분보다 뒤만 남는다.
export function minuteOptions(input: {
  hour: string;
  bound: TimeBound;
  minTime?: string | null;
  current?: string | null;
}) {
  const min = splitTime(input.minTime);
  let minutes = minuteOptionsFor(
    input.hour,
    input.bound,
    min && min.hour === input.hour ? min.minute : undefined,
  );

  const currentParts = splitTime(input.current);
  if (currentParts && currentParts.hour === input.hour && !minutes.includes(currentParts.minute)) {
    const keep = !min || joinTime(currentParts.hour, currentParts.minute) > joinTime(min.hour, min.minute);
    if (keep) {
      minutes = [...minutes, currentParts.minute].sort();
    }
  }

  return minutes;
}

// 시를 바꿨을 때 지금 분을 유지할 수 있으면 그대로, 아니면 가장 가까운 분으로.
// (시를 움직였다고 분이 맨 위로 튀지 않게 한다)
export function keepOrNearestMinute(minutes: readonly string[], desired: string) {
  if (minutes.length === 0) {
    return "";
  }
  if (minutes.includes(desired)) {
    return desired;
  }

  const target = Number(desired);
  return minutes.reduce((best, minute) =>
    Math.abs(Number(minute) - target) < Math.abs(Number(best) - target) ? minute : best,
  );
}

// minTime보다 뒤인 가장 이른 유효 시각 (종료 시간이 무효가 됐을 때 쓰는 최소 보정값).
export function firstValidTimeAfter(minTime: string, bound: TimeBound): string {
  const hours = hourOptions({ bound, minTime });
  if (hours.length === 0) {
    return "";
  }
  const hour = hours[0];
  const minutes = minuteOptions({ hour, bound, minTime });
  return minutes.length > 0 ? joinTime(hour, minutes[0]) : "";
}

// 종료 시간이 시작 시간보다 앞/같은 무효 상태인가 (빈 값은 무효가 아니다 — 선택 안 함)
export function isAfter(value: string, minTime: string) {
  const a = splitTime(value);
  const b = splitTime(minTime);
  if (!a || !b) {
    return true;
  }
  return joinTime(a.hour, a.minute) > joinTime(b.hour, b.minute);
}
