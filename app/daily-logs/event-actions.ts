"use server";

import { revalidatePath } from "next/cache";

import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/supabase/queries/calendar-events";
import { groupHasClassOn } from "@/lib/supabase/queries/occurrences";
import { getDailyLogStatusForOccurrence } from "@/lib/supabase/queries/schedule-exceptions";
import { getSupplementById } from "@/lib/supabase/queries/supplements";
import { calendarEventSchema, isSupplementClass } from "@/lib/validation/calendar-event";

type ActionResult = { error: string } | { success: true };

// 보강은 대시보드/할 일/수업일지에도 실제 수업으로 나타나므로 일정 화면만 갱신하면 부족하다.
function revalidateSupplementSurfaces() {
  revalidatePath("/daily-logs", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/todos");
}

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
  startTime?: string;
  endTime?: string;
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
      startTime: parsed.data.startTime || null,
      endTime: parsed.data.endTime || null,
    },
  } as const;
}

// 보강을 실제 수업으로 저장하기 전 안전 확인.
// - 학원 전체 휴강일에는 수업이 열리지 않으므로 등록을 막는다 (휴강을 자동 해제하지 않는다).
// - 그날 이미 이 반 수업이 있으면 막는다 — 수업일지가 반·날짜마다 하나뿐이라
//   두 수업을 따로 기록할 수 없기 때문이다.
async function checkSupplementConflicts(
  input: { groupId: string | null; startDate: string; eventType: string; startTime?: string | null; endTime?: string | null },
  ignoreSupplementId?: string,
): Promise<string | null> {
  if (!isSupplementClass({ ...input, endDate: input.startDate }) || !input.groupId) {
    return null;
  }

  if ((await getAcademyClosuresInRange(input.startDate, input.startDate)).length > 0) {
    return "이 날짜는 학원 휴강일이에요. 휴강을 먼저 해제한 뒤 보강을 등록해주세요.";
  }

  const occupied = await groupHasClassOn({
    groupId: input.groupId,
    date: input.startDate,
    ignoreSupplementId,
  });

  if (occupied) {
    return "이 날짜에는 이미 이 반 수업이 있어요. 같은 반은 하루에 한 번만 수업일지를 작성할 수 있어요.";
  }

  return null;
}

export async function createCalendarEventAction(values: EventFormValues): Promise<ActionResult> {
  const parsed = parseEvent(values);

  if ("error" in parsed) {
    return { error: parsed.error ?? "일정 내용을 다시 확인해주세요." };
  }

  const conflict = await checkSupplementConflicts(parsed.input);
  if (conflict) {
    return { error: conflict };
  }

  try {
    await createCalendarEvent(parsed.input);
  } catch (error) {
    return friendlyError(error, "일정을 저장하지 못했어요.");
  }

  revalidateSupplementSurfaces();
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

  // 수정 중인 일정 자신은 충돌 후보에서 뺀다 (시간만 바꾸는 저장이 자기 때문에 막히지 않게)
  const conflict = await checkSupplementConflicts(parsed.input, eventId);
  if (conflict) {
    return { error: conflict };
  }

  try {
    await updateCalendarEvent(eventId, parsed.input);
  } catch (error) {
    return friendlyError(error, "일정을 수정하지 못했어요.");
  }

  revalidateSupplementSurfaces();
  return { success: true };
}

export async function deleteCalendarEventAction(eventId: string): Promise<ActionResult> {
  // 보강은 실제 수업이라, 그 수업의 수업일지가 있으면 일정만 지워 기록을 고아로 만들지 않는다.
  const supplement = await getSupplementById(eventId);
  if (supplement) {
    const log = await getDailyLogStatusForOccurrence(supplement.groupId, supplement.date);
    if (log) {
      return {
        error:
          log.status === "completed"
            ? "이미 완료된 수업일지가 있어 보강 일정을 삭제할 수 없어요."
            : "작성 중인 수업일지가 있어요. 보강 일정을 삭제하기 전에 먼저 확인해주세요.",
      };
    }
  }

  try {
    await deleteCalendarEvent(eventId);
  } catch (error) {
    return friendlyError(error, "일정을 삭제하지 못했어요.");
  }

  revalidateSupplementSurfaces();
  return { success: true };
}
