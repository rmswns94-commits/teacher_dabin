// 정규수업 1회 예외(휴강/시간 변경/날짜 이동)의 canonical resolver — 순수 helper.
//
// 원칙:
// - 소비처(대시보드 현재·다음 수업, 그룹별 다음 수업, 일지 이전/다음 이동, 오늘 수업 window,
//   일지 캘린더)가 각자 "if 예외면…"을 다시 쓰지 않는다. 전부 이 파일을 거친다.
// - occurrence identity = schedule_id + occurrence_date. 같은 요일에 수업이 두 개인 그룹도
//   정확히 구분된다 (group_id + date 식별 금지).
// - 예외가 없으면 base schedule 그대로. 반복 시간표 row는 어떤 경우에도 바뀌지 않는다.
//   · cancelled     : 그 날짜의 수업이 사라진다
//   · time_override : 그 날짜의 시간만 바뀐다
//   · moved         : 원래 날짜에서 사라지고(자동 휴강), 옮긴 날짜에 옮긴 시간으로 나타난다

import { formatTimeHM } from "@/lib/schedule";

export type ScheduleExceptionKind = "cancelled" | "time_override" | "moved";

export type ScheduleExceptionEntry = {
  id: string;
  groupId: string;
  scheduleId: string;
  date: string; // 원래 occurrence 날짜 (YYYY-MM-DD, KST date-only)
  kind: ScheduleExceptionKind;
  // time_override/moved일 때만 값이 있다 ("HH:MM")
  startTime: string | null;
  endTime: string | null;
  // moved일 때만 값이 있다 — 옮겨간 날짜
  movedToDate: string | null;
};

// 보강 — 반복 시간표와 무관하게 그 날 1회만 진행하는 그룹 수업.
// 출발 occurrence가 없다는 점에서 "수업 변경(이동)"과 다르다. 저장은 calendar_events이지만
// 여기서는 날짜별 occurrence로만 다룬다 (소비처는 출처를 몰라도 된다).
export type SupplementOccurrence = {
  id: string; // calendar_events.id
  groupId: string;
  date: string;
  startTime: string; // "HH:MM"
  endTime: string;
};

// 날짜별 조회를 한 번에 하기 위한 인덱스 (소비처는 이 객체만 들고 다닌다)
export type ScheduleExceptionIndex = {
  // `${scheduleId}:${date}` → 그 occurrence의 예외
  byOccurrence: ReadonlyMap<string, ScheduleExceptionEntry>;
  // 옮겨온 날짜 → 그 날짜에 새로 열리는 수업들
  movedInByDate: ReadonlyMap<string, ScheduleExceptionEntry[]>;
  // 학원 전체 휴강일 (date-level). 개별 예외보다 우선한다.
  closedDates: ReadonlySet<string>;
  // 보강 날짜 → 그 날 1회 열리는 그룹 수업들
  supplementsByDate: ReadonlyMap<string, SupplementOccurrence[]>;
};

export const EMPTY_SCHEDULE_EXCEPTION_INDEX: ScheduleExceptionIndex = {
  byOccurrence: new Map(),
  movedInByDate: new Map(),
  closedDates: new Set(),
  supplementsByDate: new Map(),
};

export function scheduleExceptionKey(scheduleId: string, date: string) {
  return `${scheduleId}:${date}`;
}

export function buildScheduleExceptionIndex(
  entries: readonly ScheduleExceptionEntry[],
  closedDates: readonly string[] = [],
  supplements: readonly SupplementOccurrence[] = [],
): ScheduleExceptionIndex {
  const byOccurrence = new Map<string, ScheduleExceptionEntry>();
  const movedInByDate = new Map<string, ScheduleExceptionEntry[]>();
  const supplementsByDate = new Map<string, SupplementOccurrence[]>();

  for (const entry of entries) {
    byOccurrence.set(scheduleExceptionKey(entry.scheduleId, entry.date), entry);

    if (entry.kind === "moved" && entry.movedToDate) {
      movedInByDate.set(entry.movedToDate, [
        ...(movedInByDate.get(entry.movedToDate) ?? []),
        entry,
      ]);
    }
  }

  for (const supplement of supplements) {
    supplementsByDate.set(supplement.date, [
      ...(supplementsByDate.get(supplement.date) ?? []),
      supplement,
    ]);
  }

  return {
    byOccurrence,
    movedInByDate,
    closedDates: new Set(closedDates),
    supplementsByDate,
  };
}

// 그 날짜가 학원 전체 휴강일인가 — 소비처가 직접 DB를 보지 않도록 여기서만 판정한다.
export function isAcademyClosed(
  index: ScheduleExceptionIndex | null | undefined,
  date: string,
) {
  return Boolean(index?.closedDates.has(date));
}

export type ResolvedOccurrence = {
  // 이 날짜에서 수업이 사라지는가 (학원 휴강이거나 1회 휴강이거나 다른 날짜로 옮겨감)
  cancelled: boolean;
  // 휴강/이동이면 base 시간을 그대로 돌려준다 (표시용) — 소비처는 cancelled를 먼저 본다
  startTime: string; // "HH:MM"
  endTime: string;
  overridden: boolean;
  movedToDate: string | null;
  // 학원 전체 휴강 때문에 사라진 경우 (개별 1회 휴강과 구분해 안내 문구를 다르게 쓴다)
  academyClosed: boolean;
};

// 이 occurrence의 실제(effective) 시간 — 예외가 없으면 base 그대로.
export function resolveOccurrence(
  index: ScheduleExceptionIndex | null | undefined,
  scheduleId: string,
  date: string,
  baseStartTime: string,
  baseEndTime: string,
): ResolvedOccurrence {
  const base: ResolvedOccurrence = {
    cancelled: false,
    startTime: formatTimeHM(baseStartTime),
    endTime: formatTimeHM(baseEndTime),
    overridden: false,
    movedToDate: null,
    academyClosed: false,
  };

  // 우선순위 1 — 학원 전체 휴강. 그날은 개별 예외와 무관하게 수업이 없다.
  // 개별 예외 row는 그대로 두므로 휴강일을 해제하면 다시 적용된다.
  if (isAcademyClosed(index, date)) {
    return { ...base, cancelled: true, academyClosed: true };
  }

  const exception = index?.byOccurrence.get(scheduleExceptionKey(scheduleId, date));
  if (!exception) {
    return base;
  }

  if (exception.kind === "cancelled") {
    return { ...base, cancelled: true };
  }

  if (exception.kind === "moved") {
    // 원래 날짜에서는 사라진다 (옮긴 날짜는 movedInByDate로 따로 추가된다)
    return { ...base, cancelled: true, movedToDate: exception.movedToDate };
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
    movedToDate: null,
    academyClosed: false,
  };
}

// 이 날짜로 옮겨온 수업들 (요일과 무관하게 열린다).
// 학원 전체 휴강일에는 옮겨온 수업도 열리지 않는다 — 그날은 학원이 쉰다.
export function movedInOccurrences(
  index: ScheduleExceptionIndex | null | undefined,
  date: string,
): ScheduleExceptionEntry[] {
  if (isAcademyClosed(index, date)) {
    return [];
  }

  return index?.movedInByDate.get(date) ?? [];
}

// 이 날짜의 보강 수업들.
// 학원 전체 휴강일에는 보강도 열리지 않는다 — 그날은 학원이 쉰다(휴강이 가장 우선).
export function supplementOccurrences(
  index: ScheduleExceptionIndex | null | undefined,
  date: string,
): SupplementOccurrence[] {
  if (isAcademyClosed(index, date)) {
    return [];
  }

  return index?.supplementsByDate.get(date) ?? [];
}

// 1회 변경 입력 검증 — 저장 전에 UI/서버가 같은 규칙을 쓴다.
export type ExceptionValidationInput = {
  kind: ScheduleExceptionKind;
  // 원래 occurrence 날짜
  date: string;
  // moved일 때 옮길 날짜
  movedToDate?: string;
  // base schedule
  scheduleDayOfWeek: number;
  baseStartTime: string;
  baseEndTime: string;
  startTime?: string;
  endTime?: string;
  // KST 기준 오늘 (지난 날짜 예외 생성 방지)
  today: string;
  dayOfWeekOfDate: (date: string) => number;
  // 이미 다른 날짜로 옮겨둔 occurrence를 다시 옮기는 경우. 예외 row의 identity는 언제나
  // 원래 날짜라서 그 날짜는 이미 지났을 수 있다 — 실제 수업은 미래(옮긴 날짜)에 있으므로
  // 원래 날짜의 "지난 날짜" 검사는 건너뛴다. 옮길 날짜는 그대로 오늘 이후여야 한다.
  originAlreadyMoved?: boolean;
};

export function validateScheduleException(input: ExceptionValidationInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return "날짜를 선택해주세요.";
  }

  if (input.date < input.today && !input.originAlreadyMoved) {
    return "지난 날짜는 변경할 수 없어요.";
  }

  // 원래 occurrence는 반드시 그 수업의 요일이어야 한다 (어떤 종류든)
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

  if (input.kind === "moved") {
    const target = input.movedToDate ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      return "옮길 날짜를 선택해주세요.";
    }
    if (target < input.today) {
      return "지난 날짜로는 옮길 수 없어요.";
    }
    if (target === input.date) {
      // 같은 날짜면 이동이 아니라 시간 변경으로 저장해야 한다
      return start === formatTimeHM(input.baseStartTime) && end === formatTimeHM(input.baseEndTime)
        ? "원래 수업과 같아요. 날짜나 시간을 바꿔주세요."
        : null;
    }
    return null;
  }

  // time_override
  if (start === formatTimeHM(input.baseStartTime) && end === formatTimeHM(input.baseEndTime)) {
    return "원래 시간과 같아요. 다른 시간을 선택해주세요.";
  }

  return null;
}
