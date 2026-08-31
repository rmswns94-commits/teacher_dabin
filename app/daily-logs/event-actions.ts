"use server";

import { revalidatePath } from "next/cache";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/supabase/queries/calendar-events";
import { calendarEventSchema } from "@/lib/validation/calendar-event";

type ActionResult = { error: string } | { success: true };

function friendlyError(error: unknown, fallback: string): ActionResult {
  return { error: error instanceof Error && error.message ? error.message : fallback };
}

type EventFormValues = {
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  groupId: string;
  memo: string;
};

function parseEvent(values: EventFormValues) {
  const parsed = calendarEventSchema.safeParse(values);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "일정 내용을 다시 확인해주세요." } as const;
  }

  return {
    input: {
      title: parsed.data.title,
      eventType: parsed.data.eventType,
      startDate: parsed.data.startDate,
      // 종료일이 비어 있으면 하루짜리 일정으로 처리
      endDate: parsed.data.endDate || parsed.data.startDate,
      groupId: parsed.data.groupId || null,
      memo: parsed.data.memo || null,
    },
  } as const;
}

export async function createCalendarEventAction(values: EventFormValues): Promise<ActionResult> {
  const parsed = parseEvent(values);

  if ("error" in parsed) {
    return { error: parsed.error ?? "일정 내용을 다시 확인해주세요." };
  }

  try {
    await createCalendarEvent(parsed.input);
  } catch (error) {
    return friendlyError(error, "일정을 저장하지 못했어요.");
  }

  revalidatePath("/daily-logs");
  return { success: true };
}

export async function updateCalendarEventAction(
  eventId: string,
  values: EventFormValues,
): Promise<ActionResult> {
  const parsed = parseEvent(values);

  if ("error" in parsed) {
    return { error: parsed.error ?? "일정 내용을 다시 확인해주세요." };
  }

  try {
    await updateCalendarEvent(eventId, parsed.input);
  } catch (error) {
    return friendlyError(error, "일정을 수정하지 못했어요.");
  }

  revalidatePath("/daily-logs");
  return { success: true };
}

export async function deleteCalendarEventAction(eventId: string): Promise<ActionResult> {
  try {
    await deleteCalendarEvent(eventId);
  } catch (error) {
    return friendlyError(error, "일정을 삭제하지 못했어요.");
  }

  revalidatePath("/daily-logs");
  return { success: true };
}
