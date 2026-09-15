import { formatTimeHM } from "@/lib/schedule";

// 같은 날짜(요일)의 정규 수업 이전/다음 계산 — Daily Log 이전/다음 수업 바로가기용 순수 헬퍼.
// 기준: 현재 일지의 lesson_date 요일에 실제 schedule row가 있는 그룹만 후보이며(보충/시험
// 일정 제외 — class_group_schedules만 본다), 순서는 schedule.start_time ASC다.
// created_at/그룹 이름/DB 생성 순서는 순서에 관여하지 않는다.

export type AdjacentClassSlot = {
  id: string;
  group_id: string;
  day_of_week: number;
  start_time: string; // "HH:MM" 또는 "HH:MM:SS"
  group: { id: string; name: string; is_exam_period?: boolean | null } | null;
};

export type AdjacentClassTarget = {
  groupId: string;
  groupName: string;
  isExamPeriod: boolean;
  startTime: string; // "HH:MM"
};

export type AdjacentClasses = {
  previous: AdjacentClassTarget | null;
  next: AdjacentClassTarget | null;
  // 현재 그룹이 이 요일 시간표에 없으면 false — UI는 이전/다음을 아예 만들지 않는다
  hasCurrent: boolean;
};

const NONE: AdjacentClasses = { previous: null, next: null, hasCurrent: false };

export function getAdjacentScheduledClasses(
  slots: readonly AdjacentClassSlot[],
  weekday: number,
  currentGroupId: string,
): AdjacentClasses {
  const daySlots = slots
    .filter((slot) => slot.day_of_week === weekday && slot.group)
    // start_time ASC — 동률은 안정적인 schedule row id로만 가른다 (새 이름순 규칙 금지)
    .sort(
      (a, b) =>
        formatTimeHM(a.start_time).localeCompare(formatTimeHM(b.start_time)) ||
        a.id.localeCompare(b.id),
    );

  // Daily Log identity는 group+date 하나라서, 같은 그룹이 같은 요일에 schedule row를
  // 여러 개 가져도 목적지 일지는 하나다 — 그룹당 가장 이른 slot 1개만 후보로 남긴다.
  const candidates: AdjacentClassTarget[] = [];
  const seen = new Set<string>();
  for (const slot of daySlots) {
    if (seen.has(slot.group_id)) {
      continue;
    }
    seen.add(slot.group_id);
    candidates.push({
      groupId: slot.group_id,
      groupName: slot.group!.name,
      isExamPeriod: Boolean(slot.group!.is_exam_period),
      startTime: formatTimeHM(slot.start_time),
    });
  }

  const index = candidates.findIndex((candidate) => candidate.groupId === currentGroupId);
  if (index === -1) {
    return NONE;
  }

  return {
    previous: candidates[index - 1] ?? null,
    next: candidates[index + 1] ?? null,
    hasCurrent: true,
  };
}
