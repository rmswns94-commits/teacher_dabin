import { formatScheduleSlot, slotsOverlap } from "@/lib/schedule";
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

export async function addGroupSchedule(
  groupId: string,
  input: { dayOfWeek: number; startTime: string; endTime: string },
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

  // One teacher cannot be in two classes at once — reject overlapping times.
  const existing = await getCurrentUserSchedulesWithGroup();
  const candidate = {
    day_of_week: input.dayOfWeek,
    start_time: input.startTime,
    end_time: input.endTime,
  };
  const conflict = existing.find((slot) => slotsOverlap(slot, candidate));

  if (conflict) {
    throw new Error(
      `이 시간에는 이미 '${conflict.group?.name ?? "다른 반"}' 수업이 있어요. (${formatScheduleSlot(conflict)})`,
    );
  }

  const { error } = await supabase.from("class_group_schedules").insert({
    user_id: user.id,
    group_id: groupId,
    day_of_week: input.dayOfWeek,
    start_time: input.startTime,
    end_time: input.endTime,
  });

  if (error) {
    if (error.message.includes("duplicate key")) {
      throw new Error("같은 요일과 시간이 이미 등록되어 있어요.");
    }

    console.error("addGroupSchedule error", error);
    throw new Error("수업 시간을 저장하지 못했어요.");
  }

  return true;
}

export async function deleteGroupSchedule(scheduleId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("class_group_schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteGroupSchedule error", error);
    throw new Error("수업 시간을 삭제하지 못했어요.");
  }

  return true;
}
