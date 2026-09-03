"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addStudentToGroup,
  archiveGroup,
  createGroupWithDetails,
  getGroupByIdForCurrentUser,
  removeStudentFromGroup,
  restoreGroup,
  updateGroup,
  updateGroupHighlight,
  updateGroupPreparationItems,
} from "@/lib/supabase/queries/groups";
import {
  addGroupSchedules,
  deleteGroupSchedules,
  getCurrentUserSchedulesWithGroup,
  replaceGroupSchedules,
} from "@/lib/supabase/queries/schedules";
import { formatScheduleSlot, slotsOverlap } from "@/lib/schedule";
import { preparationItemSchema, preparationItemsSchema } from "@/lib/validation/daily-log";
import { groupIconPresets } from "@/lib/group-icons";
import { classGroupSchema, groupScheduleSchema } from "@/lib/validation/group";

// formData에서 scheduleDay/scheduleStart/scheduleEnd 행들을 읽어 검증한다.
// 완전히 빈 행은 건너뛰고, 일부만 채운 행은 에러로 돌려준다.
function parseScheduleRows(formData: FormData):
  | { rows: { dayOfWeek: number; startTime: string; endTime: string }[] }
  | { error: string } {
  const days = formData.getAll("scheduleDay").map(String);
  const starts = formData.getAll("scheduleStart").map(String);
  const ends = formData.getAll("scheduleEnd").map(String);
  const rows: { dayOfWeek: number; startTime: string; endTime: string }[] = [];

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i] ?? "";
    const start = starts[i] ?? "";
    const end = ends[i] ?? "";

    if (!day && !start && !end) {
      continue;
    }

    if (!day || !start || !end) {
      return { error: "수업 시간의 요일과 시작/종료 시간을 모두 입력해주세요." };
    }

    const parsed = groupScheduleSchema.safeParse({ dayOfWeek: day, startTime: start, endTime: end });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "수업 시간을 다시 확인해주세요." };
    }

    rows.push(parsed.data);
  }

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = { day_of_week: rows[i].dayOfWeek, start_time: rows[i].startTime, end_time: rows[i].endTime };
      const b = { day_of_week: rows[j].dayOfWeek, start_time: rows[j].startTime, end_time: rows[j].endTime };

      if (slotsOverlap(a, b)) {
        return { error: "입력한 수업 시간끼리 겹치거나 중복돼요. 다시 확인해주세요." };
      }
    }
  }

  // 안전장치: 시간 선택기에 값을 채워놓고 (요일만·시간만 등 불완전하게)
  // 확정하지 않은 채 제출하면, 조용히 시간을 유실하지 않고 알려준다.
  // (블록 수정 중에는 picker에 기존 블록 값이 들어있으므로 예외)
  if (rows.length === 0 && !formData.get("scheduleEditingBlock")) {
    const pickerTouched =
      formData.getAll("pickerDays").map(String).some(Boolean) ||
      formData.getAll("pickerStart").map(String).some(Boolean) ||
      formData.getAll("pickerEnd").map(String).some(Boolean);

    if (pickerTouched) {
      return {
        error:
          "선택한 수업 시간이 아직 완성되지 않았어요. 요일과 시작/종료 시간을 모두 선택하면 등록 시 함께 저장돼요.",
      };
    }
  }

  return { rows };
}

function parseTextbooks(formData: FormData) {
  const books = formData
    .getAll("textbook")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return books.slice(0, 10).join("\n");
}

// 대표 아이콘: preset 목록에 있는 값만 허용 (자유 입력 차단)
function parseGroupIcon(formData: FormData) {
  const value = String(formData.get("groupIcon") ?? "").trim();
  return value && (groupIconPresets as readonly string[]).includes(value) ? value : null;
}

export type GroupCreateState = { error?: string } | undefined;

export async function createGroupAction(_prevState: GroupCreateState, formData: FormData): Promise<GroupCreateState> {
  const payload = {
    name: String(formData.get("name") ?? ""),
    grade: String(formData.get("grade") ?? ""),
    memo: String(formData.get("memo") ?? ""),
    textbook: parseTextbooks(formData),
  };

  const parsed = classGroupSchema.safeParse(payload);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "수업 그룹 정보를 다시 확인해주세요." };
  }

  const scheduleResult = parseScheduleRows(formData);

  if ("error" in scheduleResult) {
    return { error: scheduleResult.error };
  }

  // 다른 반 수업과 겹치는 시간은 저장 전에 막는다.
  if (scheduleResult.rows.length > 0) {
    const existing = await getCurrentUserSchedulesWithGroup();

    for (const row of scheduleResult.rows) {
      const candidate = { day_of_week: row.dayOfWeek, start_time: row.startTime, end_time: row.endTime };
      const conflict = existing.find((slot) => slotsOverlap(slot, candidate));

      if (conflict) {
        return {
          error: `이 시간에는 이미 '${conflict.group?.name ?? "다른 반"}' 수업이 있어요. (${formatScheduleSlot(conflict)})`,
        };
      }
    }
  }

  let groupId: string;

  try {
    const group = await createGroupWithDetails({
      name: parsed.data.name,
      grade: parsed.data.grade,
      memo: parsed.data.memo || null,
      textbook: parsed.data.textbook || null,
      icon: parseGroupIcon(formData),
      schedules: scheduleResult.rows,
    });
    groupId = group.id;
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "수업 그룹을 저장하지 못했어요.",
    };
  }

  revalidatePath("/groups");
  revalidatePath("/dashboard");
  redirect(`/groups/${groupId}`);
}

export async function updateGroupAction(groupId: string, formData: FormData) {
  const payload = {
    name: String(formData.get("name") ?? ""),
    grade: String(formData.get("grade") ?? ""),
    memo: String(formData.get("memo") ?? ""),
    textbook: parseTextbooks(formData),
    highlightMemo: String(formData.get("highlightMemo") ?? ""),
  };

  const parsed = classGroupSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "수업 그룹 정보를 다시 확인해주세요.");
  }

  // 시간 선택기에 골라두고 [추가]를 누르지 않은 수업 시간도 저장 버튼으로 함께 저장.
  // 스케줄 쪽 문제(미완성 선택·겹침)는 에러 화면 대신, 그룹 정보는 저장한 뒤
  // 수정 화면의 배너로 알려준다 (native form이라 throw하면 크래시 화면이 뜬다).
  const scheduleResult = parseScheduleRows(formData);

  await updateGroup(groupId, {
    name: parsed.data.name,
    grade: parsed.data.grade,
    memo: parsed.data.memo || null,
    textbook: parsed.data.textbook || null,
    highlightMemo: parsed.data.highlightMemo || null,
    icon: parseGroupIcon(formData),
  });

  let scheduleError: string | null = null;

  if ("error" in scheduleResult) {
    scheduleError = scheduleResult.error ?? "수업 시간을 다시 확인해주세요.";
  } else if (scheduleResult.rows.length > 0) {
    try {
      await addGroupSchedules(groupId, scheduleResult.rows);
    } catch (error) {
      scheduleError =
        error instanceof Error && error.message ? error.message : "수업 시간을 저장하지 못했어요.";
    }
  }

  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/dashboard");
  revalidatePath("/daily-logs");

  if (scheduleError) {
    redirect(`/groups/${groupId}?edit=1&scheduleError=${encodeURIComponent(scheduleError)}`);
  }

  redirect(`/groups/${groupId}?saved=1`);
}

export async function archiveGroupAction(groupId: string) {
  await archiveGroup(groupId);
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  redirect("/groups");
}

export async function restoreGroupAction(groupId: string) {
  await restoreGroup(groupId);
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  redirect("/groups");
}

export async function addStudentToGroupAction(groupId: string, formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");

  if (!studentId) {
    throw new Error("학생을 선택해주세요.");
  }

  await addStudentToGroup(groupId, studentId);
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}

export async function removeStudentFromGroupAction(groupId: string, studentId: string) {
  await removeStudentFromGroup(groupId, studentId);
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}

export async function updateGroupHighlightAction(groupId: string, text: string) {
  const trimmed = text.trim();

  if (trimmed.length > 500) {
    return { error: "하이라이트는 500자 이내로 입력해주세요." };
  }

  const group = await getGroupByIdForCurrentUser(groupId);

  if (!group) {
    return { error: "수업 그룹을 찾을 수 없어요." };
  }

  try {
    await updateGroupHighlight(groupId, trimmed || null);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "하이라이트를 저장하지 못했어요.",
    };
  }

  revalidatePath(`/groups/${groupId}`);
  return { success: true as const };
}

type ScheduleSetValues = { days: number[]; startTime: string; endTime: string };

function parseScheduleSet(values: ScheduleSetValues) {
  if (!Array.isArray(values.days) || values.days.length === 0) {
    return { error: "수업 요일을 하나 이상 선택해주세요." } as const;
  }

  const rows: { dayOfWeek: number; startTime: string; endTime: string }[] = [];

  for (const day of [...new Set(values.days)]) {
    const parsed = groupScheduleSchema.safeParse({
      dayOfWeek: String(day),
      startTime: values.startTime,
      endTime: values.endTime,
    });

    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "수업 시간을 다시 확인해주세요.",
      } as const;
    }

    rows.push(parsed.data);
  }

  return { rows } as const;
}

function revalidateSchedulePages(groupId: string) {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/daily-logs");
}

export async function addGroupScheduleSetAction(
  groupId: string,
  values: ScheduleSetValues,
): Promise<{ error: string } | { success: true }> {
  const parsed = parseScheduleSet(values);

  if ("error" in parsed) {
    return { error: parsed.error ?? "수업 시간을 다시 확인해주세요." };
  }

  try {
    await addGroupSchedules(groupId, parsed.rows);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "수업 시간을 저장하지 못했어요.",
    };
  }

  revalidateSchedulePages(groupId);
  return { success: true };
}

export async function replaceGroupScheduleSetAction(
  groupId: string,
  deleteIds: string[],
  values: ScheduleSetValues,
): Promise<{ error: string } | { success: true }> {
  const parsed = parseScheduleSet(values);

  if ("error" in parsed) {
    return { error: parsed.error ?? "수업 시간을 다시 확인해주세요." };
  }

  try {
    await replaceGroupSchedules(groupId, deleteIds, parsed.rows);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "수업 시간을 수정하지 못했어요.",
    };
  }

  revalidateSchedulePages(groupId);
  return { success: true };
}

export async function deleteGroupScheduleSetAction(
  groupId: string,
  scheduleIds: string[],
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteGroupSchedules(scheduleIds);
  } catch (error) {
    return {
      error: error instanceof Error && error.message ? error.message : "수업 시간을 삭제하지 못했어요.",
    };
  }

  revalidateSchedulePages(groupId);
  return { success: true };
}

async function getOwnedPreparationItems(groupId: string) {
  const group = await getGroupByIdForCurrentUser(groupId);

  if (!group) {
    throw new Error("수업 그룹을 찾을 수 없어요.");
  }

  return (group.preparation_items ?? []) as { id: string; text: string; completed: boolean }[];
}

function revalidatePreparation(groupId: string) {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/dashboard");
}

export async function addPreparationItemAction(groupId: string, formData: FormData) {
  const parsed = preparationItemSchema.safeParse({
    id: globalThis.crypto.randomUUID(),
    text: String(formData.get("text") ?? ""),
    completed: false,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "준비 항목 내용을 입력해주세요.");
  }

  const items = await getOwnedPreparationItems(groupId);

  // 같은 문구가 이미 있으면 조용히 무시한다 (제안 chip을 두 번 누른 경우 등).
  if (!items.some((item) => item.text === parsed.data.text)) {
    const next = preparationItemsSchema.parse([...items, parsed.data]);
    await updateGroupPreparationItems(groupId, next);
  }

  revalidatePreparation(groupId);
}

export async function togglePreparationItemAction(groupId: string, itemId: string) {
  const items = await getOwnedPreparationItems(groupId);
  const next = items.map((item) =>
    item.id === itemId ? { ...item, completed: !item.completed } : item,
  );

  await updateGroupPreparationItems(groupId, next);
  revalidatePreparation(groupId);
}

export async function deletePreparationItemAction(groupId: string, itemId: string) {
  const items = await getOwnedPreparationItems(groupId);
  const next = items.filter((item) => item.id !== itemId);

  await updateGroupPreparationItems(groupId, next);
  revalidatePreparation(groupId);
}
