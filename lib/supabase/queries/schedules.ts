import { DAY_LABELS, formatScheduleSlot, slotsOverlap } from "@/lib/schedule";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupScheduleRecord, PreparationItem, StudentGrade } from "@/lib/supabase/types";

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

export async function getGroupSchedules(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ClassGroupScheduleRecord[];
  }

  const { data, error } = await supabase
    .from("class_group_schedules")
    .select("*")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("getGroupSchedules error", error);
    return [] as ClassGroupScheduleRecord[];
  }

  return (data ?? []) as ClassGroupScheduleRecord[];
}

export type ScheduleGroupInfo = {
  id: string;
  name: string;
  grade: StudentGrade;
  archived: boolean;
  preparation_items: PreparationItem[] | null;
};

export type ScheduleWithGroup = ClassGroupScheduleRecord & { group: ScheduleGroupInfo | null };

// Every schedule of the current user with its group, archived groups excluded.
export async function getCurrentUserSchedulesWithGroup() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as ScheduleWithGroup[];
  }

  const { data, error } = await supabase
    .from("class_group_schedules")
    .select("*, class_groups(id, name, grade, archived, preparation_items)")
    .eq("user_id", user.id);

  if (error) {
    console.error("getCurrentUserSchedulesWithGroup error", error);
    return [] as ScheduleWithGroup[];
  }

  return (data ?? [])
    .map((row) => ({
      ...(row as unknown as ClassGroupScheduleRecord),
      group: pickOne<ScheduleGroupInfo>(row.class_groups),
    }))
    .filter((row) => row.group && !row.group.archived) as ScheduleWithGroup[];
}

// 여러 요일을 한 번에 등록한다. 완전히 같은 (요일+시간)이 이미 있으면
// 조용히 건너뛰고, 시간이 겹치는 다른 schedule이 있으면 에러를 낸다.
// excludeIds: 블록 "교체" 시 곧 삭제될 기존 row들은 겹침 검사에서 제외.
export async function addGroupSchedules(
  groupId: string,
  rows: { dayOfWeek: number; startTime: string; endTime: string }[],
  excludeIds: string[] = [],
  dryRun = false,
) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: group } = await supabase
    .from("class_groups")
    .select("id")
    .eq("id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!group) {
    throw new Error("수업 그룹을 찾을 수 없어요.");
  }

  const excluded = new Set(excludeIds);
  const existing = (await getCurrentUserSchedulesWithGroup()).filter(
    (slot) => !excluded.has(slot.id),
  );

  const toInsert: typeof rows = [];

  for (const row of rows) {
    const candidate = {
      day_of_week: row.dayOfWeek,
      start_time: row.startTime,
      end_time: row.endTime,
    };

    // 같은 그룹에 완전히 동일한 schedule이 이미 있으면 건너뛴다 (중복 방지).
    const exact = existing.find(
      (slot) =>
        slot.group_id === groupId &&
        slot.day_of_week === row.dayOfWeek &&
        slot.start_time.slice(0, 5) === row.startTime &&
        slot.end_time.slice(0, 5) === row.endTime,
    );

    if (exact) {
      continue;
    }

    const conflict = existing.find((slot) => slotsOverlap(slot, candidate));

    if (conflict) {
      if (conflict.group_id === groupId) {
        throw new Error(`${DAY_LABELS[conflict.day_of_week]}요일에 이미 겹치는 수업 시간이 있어요.`);
      }

      throw new Error(
        `이 시간에는 이미 '${conflict.group?.name ?? "다른 반"}' 수업이 있어요. (${formatScheduleSlot(conflict)})`,
      );
    }

    toInsert.push(row);
  }

  if (dryRun || toInsert.length === 0) {
    return true;
  }

  const { error } = await supabase.from("class_group_schedules").insert(
    toInsert.map((row) => ({
      user_id: user.id,
      group_id: groupId,
      day_of_week: row.dayOfWeek,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
  );

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error("같은 요일과 시간이 이미 등록되어 있어요.");
    }

    console.error("addGroupSchedules error", error);
    throw new Error("수업 시간을 저장하지 못했어요.");
  }

  return true;
}

export async function deleteGroupSchedules(scheduleIds: string[]) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (scheduleIds.length === 0) {
    return true;
  }

  const { error } = await supabase
    .from("class_group_schedules")
    .delete()
    .in("id", scheduleIds)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteGroupSchedules error", error);
    throw new Error("수업 시간을 삭제하지 못했어요.");
  }

  return true;
}

// 블록 수정: 먼저 검증만 수행(삭제 예정 row 제외)해서 실패해도 기존 일정이
// 사라지지 않게 하고, 통과하면 삭제 → 삽입 순서로 교체한다.
export async function replaceGroupSchedules(
  groupId: string,
  deleteIds: string[],
  rows: { dayOfWeek: number; startTime: string; endTime: string }[],
) {
  await addGroupSchedules(groupId, rows, deleteIds, true);
  await deleteGroupSchedules(deleteIds);
  await addGroupSchedules(groupId, rows, deleteIds);
  return true;
}
