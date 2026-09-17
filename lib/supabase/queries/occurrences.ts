import { dayOfWeekOf } from "@/lib/schedule";
import {
  buildScheduleExceptionIndex,
  movedInOccurrences,
  resolveOccurrence,
  supplementOccurrences,
} from "@/lib/schedule-exceptions";
import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";
import { getScheduleExceptionsInRange } from "@/lib/supabase/queries/schedule-exceptions";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";
import { getSupplementsInRange } from "@/lib/supabase/queries/supplements";

// "그 날짜에 이 반 수업이 이미 있는가" — 저장 전 충돌 확인용 공용 판정.
//
// 왜 필요한가: 수업일지 identity가 (반 + 날짜) 하나이고 DB에도 unique가 걸려 있다.
// 같은 반 수업이 하루에 둘이 되면 두 수업을 따로 기록할 수 없다. 그래서 수업 이동과
// 보강 등록 양쪽이 같은 규칙으로 막는다 (규칙을 두 번 구현하지 않는다).
//
// 세는 대상은 그 날짜의 "실제 수업" 전부다: 반복 시간표 + 옮겨온 수업 + 보강.
// 학원 전체 휴강일이면 그날은 아무 수업도 없으므로 false다.
export async function groupHasClassOn(input: {
  groupId: string;
  date: string;
  // 지금 저장하려는 1회 예외 자신 (이미 옮겨둔 수업의 시간만 바꾸는 재저장이 자기 때문에 막히지 않게)
  ignoreException?: { scheduleId: string; originDate: string };
  // 지금 수정 중인 보강 자신
  ignoreSupplementId?: string;
}) {
  const [schedules, exceptions, closures, supplements] = await Promise.all([
    getGroupSchedules(input.groupId),
    getScheduleExceptionsInRange(input.date, input.date),
    getAcademyClosuresInRange(input.date, input.date),
    getSupplementsInRange(input.date, input.date),
  ]);

  const index = buildScheduleExceptionIndex(
    exceptions.filter(
      (entry) =>
        !(
          input.ignoreException &&
          entry.scheduleId === input.ignoreException.scheduleId &&
          entry.date === input.ignoreException.originDate
        ),
    ),
    closures,
    supplements.filter((row) => row.id !== input.ignoreSupplementId),
  );

  const dow = dayOfWeekOf(input.date);
  const hasRegular = schedules.some(
    (slot) =>
      slot.day_of_week === dow &&
      !resolveOccurrence(index, slot.id, input.date, slot.start_time, slot.end_time).cancelled,
  );

  if (hasRegular) {
    return true;
  }

  const scheduleIds = new Set(schedules.map((slot) => slot.id));
  if (movedInOccurrences(index, input.date).some((moved) => scheduleIds.has(moved.scheduleId))) {
    return true;
  }

  return supplementOccurrences(index, input.date).some((row) => row.groupId === input.groupId);
}
