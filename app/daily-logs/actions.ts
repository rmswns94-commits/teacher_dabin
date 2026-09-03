"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteDailyLog,
  DuplicateDailyLogError,
  getDailyLogDetailForCurrentUser,
  getGroupHistoryLogs,
  getPraisesForDailyLog,
  saveDailyLog,
  updateDailyLogFields,
} from "@/lib/supabase/queries/daily-logs";
import {
  deleteDailyLogDraftById,
  deleteDailyLogDraftsForIdentity,
  upsertDailyLogDraft,
} from "@/lib/supabase/queries/daily-log-drafts";
import {
  dailyLogSchema,
  historyLogUpdateSchema,
  type DailyLogFormInput,
  type HistoryLogUpdateInput,
} from "@/lib/validation/daily-log";

export async function saveDailyLogAction(input: DailyLogFormInput & { draftId?: string | null }) {
  const parsed = dailyLogSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  let dailyLogId: string | null = null;

  try {
    dailyLogId = await saveDailyLog(parsed.data);
  } catch (error) {
    // 중복은 일반 오류가 아니라 전용 경고 dialog로 안내한다 (form 내용은 보존)
    if (error instanceof DuplicateDailyLogError) {
      return { error: error.message, duplicate: true as const };
    }

    console.error("saveDailyLogAction error", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "수업 기록을 저장하지 못했어요. 다시 시도해주세요.",
    };
  }

  // final 저장 성공 → 임시저장 draft 정리 (autosave copy가 중복으로 남지 않게)
  await deleteDailyLogDraftsForIdentity(
    parsed.data.dailyLogId ? { dailyLogId: parsed.data.dailyLogId } : {},
  );
  await deleteDailyLogDraftsForIdentity({
    groupId: parsed.data.groupId,
    classDate: parsed.data.classDate,
  });

  revalidatePath("/daily-logs");
  revalidatePath(`/daily-logs/${dailyLogId}`);
  revalidatePath("/makeups");
  revalidatePath("/dashboard");
  // 관찰값(질문/배려/노력 등) 변경이 성장노트 주간 판정에 바로 반영되게 한다
  revalidatePath("/growth-notes", "layout");
  redirect(`/daily-logs/${dailyLogId}?saved=1`);
}

// 수업일지 삭제 (destructive — client에서 확인 dialog를 거친 뒤 호출).
// 성공 시 class_date를 돌려줘 삭제 후에도 같은 날짜 목록으로 돌아갈 수 있게 한다.
export async function deleteDailyLogAction(dailyLogId: string) {
  let classDate: string;

  try {
    classDate = await deleteDailyLog(dailyLogId);
  } catch (error) {
    console.error("deleteDailyLogAction error", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "수업일지를 삭제하지 못했어요. 다시 시도해주세요.",
    };
  }

  revalidatePath("/daily-logs");
  revalidatePath("/makeups");
  revalidatePath("/dashboard");
  revalidatePath("/students");
  revalidatePath("/groups");
  // 삭제된 출결/평가/칭찬이 성장노트 주간 판정·칭찬 요약에 stale하게 남지 않게
  revalidatePath("/growth-notes", "layout");

  return { success: true as const, classDate };
}

// ── 이전 수업 기록 패널 ────────────────────────────────────────────────

// 더 보기 pagination용 lightweight 목록 조회 (첫 페이지는 서버 렌더에서 프리페치)
export async function loadGroupHistoryAction(input: {
  groupId: string;
  before: string;
  offset: number;
}) {
  if (
    !input.groupId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.before) ||
    !Number.isInteger(input.offset) ||
    input.offset < 0 ||
    input.offset > 1000
  ) {
    return { error: "이전 수업 기록을 불러오지 못했어요." };
  }

  try {
    return await getGroupHistoryLogs(input.groupId, input.before, input.offset, 10);
  } catch (error) {
    console.error("loadGroupHistoryAction error", error);
    return { error: "이전 수업 기록을 불러오지 못했어요." };
  }
}

// 선택한 이전 일지의 학생 기록 + 칭찬 lazy 조회 (daily_log_id 기준 batch — N+1 없음)
export async function loadHistoryRecordsAction(dailyLogId: string) {
  try {
    const [detail, praises] = await Promise.all([
      getDailyLogDetailForCurrentUser(dailyLogId),
      getPraisesForDailyLog(dailyLogId),
    ]);

    if (!detail) {
      return { error: "수업 기록을 찾지 못했어요." };
    }

    return { records: detail.lessonLogs, praises };
  } catch (error) {
    console.error("loadHistoryRecordsAction error", error);
    return { error: "학생 기록을 불러오지 못했어요." };
  }
}

// 이전 일지의 공통 필드 수정 — 현재 작성 중인 폼과 완전히 독립적으로 동작
export async function updateHistoryLogAction(input: HistoryLogUpdateInput) {
  const parsed = historyLogUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 다시 확인해주세요." };
  }

  try {
    const row = await updateDailyLogFields({
      dailyLogId: parsed.data.dailyLogId,
      title: parsed.data.title ?? "",
      defaultProgress: parsed.data.defaultProgress ?? "",
      memo: parsed.data.memo ?? "",
      homework: parsed.data.homework ?? "",
      nextLessonPlan: parsed.data.nextLessonPlan ?? "",
      nextPlanDate: parsed.data.nextPlanDate || null,
    });

    revalidatePath("/daily-logs");
    revalidatePath(`/daily-logs/${row.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/groups");
    revalidatePath(`/groups/${row.group_id}`);
    // 과거 진도/기록 수정이 성장노트 요약에 stale하게 남지 않게
    revalidatePath("/growth-notes", "layout");

    return { success: true as const, row };
  } catch (error) {
    console.error("updateHistoryLogAction error", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "이전 수업 기록을 저장하지 못했어요. 다시 시도해주세요.",
    };
  }
}

// ── 수업일지 자동 임시저장 ──────────────────────────────────────────────
// background persistence 전용: revalidate/redirect/side effect 전혀 없음.
// (학생 기록·칭찬·보충·연동 Todo·캘린더·성장노트는 final 저장에서만 변한다)
export async function autosaveDailyLogDraftAction(input: {
  draftId: string | null;
  dailyLogId: string | null;
  groupId: string;
  classDate: string;
  payload: unknown;
}) {
  if (!input.groupId || !/^\d{4}-\d{2}-\d{2}$/.test(input.classDate)) {
    return { error: "임시저장하지 못했어요." };
  }

  try {
    if (JSON.stringify(input.payload ?? {}).length > 200_000) {
      return { error: "임시저장 내용이 너무 커요." };
    }

    const result = await upsertDailyLogDraft(input);
    return { success: true as const, draftId: result.draftId, updatedAt: result.updatedAt };
  } catch (error) {
    console.error("autosaveDailyLogDraftAction error", error);
    return { error: "임시저장하지 못했어요." };
  }
}

export async function discardDailyLogDraftAction(draftId: string) {
  try {
    await deleteDailyLogDraftById(draftId);
    return { success: true as const };
  } catch (error) {
    console.error("discardDailyLogDraftAction error", error);
    return { error: "임시저장을 삭제하지 못했어요." };
  }
}
