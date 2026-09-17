// 정규수업 1회 예외(휴강/시간 변경)의 canonical resolver — 순수 helper.
//
// 원칙:
// - 소비처(대시보드 현재·다음 수업, 그룹별 다음 수업, 일지 이전/다음 이동, 오늘 수업 window)가
//   각자 "if 예외면…"을 다시 쓰지 않는다. 전부 이 파일의 resolveOccurrence를 거친다.
// - occurrence identity = schedule_id + occurrence_date. 같은 요일에 수업이 두 개인 그룹도
//   정확히 구분된다 (group_id + date 식별 금지).
// - 예외가 없으면 base schedule 그대로. 휴강이면 occurrence 자체가 사라지고,
//   시간 변경이면 start/end만 교체된다 — base schedule row는 절대 바뀌지 않는다.

import { formatTimeHM } from "@/lib/schedule";

export type ScheduleExceptionKind = "cancelled" | "time_override";

export type ScheduleExceptionEntry = {
  id: string;
  groupId: string;
  scheduleId: string;
  date: string; // YYYY-MM-DD (KST date-only)
  kind: ScheduleExceptionKind;
  // time_override일 때만 값이 있다 ("HH:MM")
  startTime: string | null;
  endTime: string | null;
};

export type ScheduleExceptionMap = ReadonlyMap<string, ScheduleExceptionEntry>;

export function scheduleExceptionKey(scheduleId: string, date: string) {
  return `${scheduleId}:${date}`;
}

export function buildScheduleExceptionMap(
  entries: readonly ScheduleExceptionEntry[],
): ScheduleExceptionMap {
  return new Map(entries.map((entry) => [scheduleExceptionKey(entry.scheduleId, entry.date), entry]));
}

export type ResolvedOccurrence = {
  cancelled: boolean;
  // 휴강이면 base 시간을 그대로 돌려준다 (표시용) — 소비처는 cancelled를 먼저 본다
  startTime: string; // "HH:MM"
  endTime: string;
  overridden: boolean;
};

// 이 occurrence의 실제(effective) 시간 — 예외가 없으면 base 그대로.
export function resolveOccurrence(
  exceptions: ScheduleExceptionMap | null | undefined,
  scheduleId: string,
  date: string,
  baseStartTime: string,
  baseEndTime: string,
): ResolvedOccurrence {
  const base = {
    cancelled: false,
    startTime: formatTimeHM(baseStartTime),
    endTime: formatTimeHM(baseEndTime),
    overridden: false,
  };

  const exception = exceptions?.get(scheduleExceptionKey(scheduleId, date));
  if (!exception) {
    return base;
  }

  if (exception.kind === "cancelled") {
    return { ...base, cancelled: true };
  }

  if (!exception.startTime || !exception.endTime) {
    // 손상된 override(시간 없음)는 무시하고 base를 쓴다 — 화면이 비어버리지 않게
    return base;
  }

  return {
    cancelled: false,
    startTime: formatTimeHM(exception.startTime),
    endTime: formatTimeHM(exception.endTime),
    overridden: true,
  };
}

// 1회 변경 입력 검증 — 저장 전에 UI/서버가 같은 규칙을 쓴다.
export type ExceptionValidationInput = {
  kind: ScheduleExceptionKind;
  date: string;
  // base schedule
  scheduleDayOfWeek: number;
  baseStartTime: string;
  baseEndTime: string;
  startTime?: string;
  endTime?: string;
  // KST 기준 오늘 (지난 날짜 예외 생성 방지)
  today: string;
  dayOfWeekOfDate: (date: string) => number;
};

export function validateScheduleException(input: ExceptionValidationInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return "날짜를 선택해주세요.";
  }

  if (input.date < input.today) {
    return "지난 날짜는 변경할 수 없어요.";
  }

  // 이번 기능은 "같은 날짜 안에서" 휴강/시간 변경만 — 다른 요일로 옮기는 기능이 아니다
  if (input.dayOfWeekOfDate(input.date) !== input.scheduleDayOfWeek) {
    return "이 수업이 있는 요일의 날짜만 선택할 수 있어요.";
  }

  if (input.kind === "cancelled") {
    return null;
  }

  const start = formatTimeHM(input.startTime ?? "");
  const end = formatTimeHM(input.endTime ?? "");

  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return "시작 시간과 종료 시간을 선택해주세요.";
  }

  if (start >= end) {
    return "종료 시간은 시작 시간보다 늦어야 해요.";
  }

  if (start === formatTimeHM(input.baseStartTime) && end === formatTimeHM(input.baseEndTime)) {
    return "원래 시간과 같아요. 다른 시간을 선택해주세요.";
  }

  return null;
}
