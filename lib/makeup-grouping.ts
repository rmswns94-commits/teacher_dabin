import { dayOfWeekOf } from "@/lib/calendar";
import { formatTimeRange } from "@/lib/schedule";

// "일정이 필요한 보충" 카드의 계층 그룹핑 (표시 전용 — DB/predicate 무변경):
// 1차 = 실제 결석 lesson_date(makeup.original_class_date 스냅샷 — created_at 아님),
// 2차 = 그 결석이 발생한 original group (직접 등록/일지 경유 relation — 학생의 현재
// 첫 그룹으로 추측하지 않는다). 각 record는 정확히 한 (날짜, 그룹) 섹션에만 들어간다.
//
// 정렬: 결석일 오래된 순 → 같은 날짜에서는 그 요일 수업 시작시간 순(시간표 없으면
// 그룹명 가나다, 그룹 미상은 마지막) → 같은 그룹에서는 학생 이름 가나다(tie: id).
// legacy 방어: 결석일을 못 정하는 record(직접 등록 잔재 등)는 날짜를 추측하지 않고
// "결석일 미확인" 섹션(맨 뒤)으로, 그룹 relation이 없으면 "반 정보 없음" 소섹션으로.

export type PendingMakeupSlot = {
  groupId: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type PendingMakeupRowLike = {
  id: string;
  source: "absence" | "manual";
  absenceDate: string;
  groupId: string | null;
  groupName: string | null;
  studentName: string;
  missedProgress: string | null;
};

export type PendingMakeupGroupSection<T> = {
  groupId: string | null;
  groupName: string | null;
  // 결석일 요일과 일치하는 그 그룹의 수업시간 ("17:00 ~ 18:30", 복수면 ", " 연결, 미상 "")
  timeLabel: string;
  // 이 (결석일, 반)의 학생들이 모두 같은 놓친 진도를 가질 때만 그 값 (헤더에 한 번만 표시).
  // 값이 서로 다르면 null — 그때는 카드마다 자기 진도를 보여줘야 정보가 사라지지 않는다.
  commonMissedProgress: string | null;
  rows: T[];
};

export type PendingMakeupDateSection<T> = {
  absenceDate: string | null; // null = 결석일 미확인
  count: number;
  groups: PendingMakeupGroupSection<T>[];
};

const koreanCollator = new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true });

// 한 (결석일, 반)의 학생들이 전부 같은 놓친 진도를 적어둔 경우에만 그 값을 돌려준다
// (그 반의 공통 진도 → 헤더에 한 번만 표시). 학생마다 다르게 적혀 있으면 null이라
// 카드가 각자 값을 계속 보여준다 — 첫 학생 값을 대표로 삼아 나머지를 숨기지 않는다.
// 비어 있는 값은 비교에서 빼고, 모두 비어 있으면 null.
function commonMissedProgressOf(rows: PendingMakeupRowLike[]): string | null {
  const values = rows.map((row) => row.missedProgress?.trim() ?? "").filter(Boolean);

  if (values.length === 0 || values.length !== rows.length) {
    return null; // 일부만 적혀 있으면 공통값으로 볼 수 없다
  }

  return values.every((value) => value === values[0]) ? values[0] : null;
}

// map 키 sentinel — 실제 날짜(YYYY-MM-DD)/그룹 id(uuid)와 절대 충돌하지 않는 값
const UNKNOWN_DATE_KEY = "__unknown-absence-date__";
const UNKNOWN_GROUP_KEY = "__no-group__";

export function groupPendingMakeups<T extends PendingMakeupRowLike>(
  rows: T[],
  slots: PendingMakeupSlot[],
): PendingMakeupDateSection<T>[] {
  // 결석일: absence 연동 record의 original_class_date만 결석일로 인정.
  // 직접 등록(manual)의 original_class_date는 보충 예정일이라 결석일로 쓰지 않는다.
  const absenceDateOf = (row: T): string | null =>
    row.source === "absence" && row.absenceDate ? row.absenceDate : null;

  const byDate = new Map<string, Map<string, PendingMakeupGroupSection<T>>>();

  for (const row of rows) {
    const dateKey = absenceDateOf(row) ?? UNKNOWN_DATE_KEY;
    const groupKey = row.groupId ?? UNKNOWN_GROUP_KEY;
    const groups = byDate.get(dateKey) ?? new Map<string, PendingMakeupGroupSection<T>>();
    byDate.set(dateKey, groups);
    const section =
      groups.get(groupKey) ??
      ({
        groupId: row.groupId,
        groupName: row.groupName,
        timeLabel: "",
        commonMissedProgress: null,
        rows: [],
      } as PendingMakeupGroupSection<T>);
    groups.set(groupKey, section);
    section.rows.push(row);
  }

  // 결석일 요일과 일치하는 그룹 슬롯의 수업시간 (시작시간 순, 중복 표기는 하나로)
  const timeInfoOf = (groupId: string | null, dateKey: string) => {
    if (!groupId || dateKey === UNKNOWN_DATE_KEY) {
      return { label: "", firstStart: "99:99" };
    }
    const dow = dayOfWeekOf(dateKey);
    const matched = slots
      .filter((slot) => slot.groupId === groupId && slot.day_of_week === dow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    return {
      label: [...new Set(matched.map((slot) => formatTimeRange(slot.start_time, slot.end_time)))].join(", "),
      firstStart: matched[0]?.start_time ?? "99:99",
    };
  };

  const dateKeys = [...byDate.keys()].sort((a, b) => {
    if (a === UNKNOWN_DATE_KEY) return 1; // 미확인은 항상 마지막
    if (b === UNKNOWN_DATE_KEY) return -1;
    return a.localeCompare(b); // 오래 밀린 결석 우선
  });

  return dateKeys.map((dateKey) => {
    const groupSections = [...byDate.get(dateKey)!.values()].map((section) => {
      const time = timeInfoOf(section.groupId, dateKey);
      section.timeLabel = time.label;
      section.commonMissedProgress = commonMissedProgressOf(section.rows);
      section.rows.sort(
        (a, b) => koreanCollator.compare(a.studentName, b.studentName) || a.id.localeCompare(b.id),
      );
      return { section, firstStart: time.firstStart };
    });

    groupSections.sort((a, b) => {
      const noGroupA = a.section.groupId === null ? 1 : 0;
      const noGroupB = b.section.groupId === null ? 1 : 0;
      return (
        noGroupA - noGroupB || // 반 정보 없음은 마지막
        a.firstStart.localeCompare(b.firstStart) || // 그 날짜의 수업 시작시간 순
        koreanCollator.compare(a.section.groupName ?? "", b.section.groupName ?? "")
      );
    });

    const groups = groupSections.map(({ section }) => section);
    return {
      absenceDate: dateKey === UNKNOWN_DATE_KEY ? null : dateKey,
      count: groups.reduce((sum, section) => sum + section.rows.length, 0),
      groups,
    };
  });
}
