"use server";

import { revalidatePath } from "next/cache";

import {
  deleteDailyLog,
  deleteDraftDailyLog,
  DuplicateDailyLogError,
  getDailyLogDetailForCurrentUser,
  getGroupHistoryLogs,
  getPraisesForDailyLog,
  saveDailyLog,
  toggleHomeworkCompletion,
  updateDailyLogFields,
} from "@/lib/supabase/queries/daily-logs";
import {
  deleteDailyLogDraftById,
  deleteDailyLogDraftsForIdentity,
  deleteOwnedDailyLogDraft,
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
    // 중복은 일반 오류가 아니라 전용 경고 dialog로 안내한다 (form 내용은 보존).
    // 기존 일지 id를 함께 내려 "이어쓰기" 링크를 제공한다 — "삭제 후 재작성" 강요 금지.
    if (error instanceof DuplicateDailyLogError) {
      return { error: error.message, duplicate: true as const, existingLogId: error.existingLogId };
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
  // 일지 저장은 오늘 할 일 화면의 두 source를 모두 바꾼다 —
  // 숙제(완료일 기준으로 그 날짜에 표시)와 [수업 기록 완료] 시 만들어지는 해야 할 일 Todo.
  // 이 경로가 빠져 있으면 /todos만 stale해질 수 있다.
  revalidatePath("/todos");
  // 관찰값(질문/배려/노력 등) 변경이 성장노트 주간 판정에 바로 반영되게 한다
  revalidatePath("/growth-notes", "layout");

  // 저장 결과(정확한 id + 저장된 classDate)를 클라이언트에 돌려준다.
  // navigation은 클라이언트 성공 핸들러 한 곳이 담당한다 — server action redirect에
  // 의존하지 않아 [수업 기록 완료] 후 이동이 결정적으로 일어난다.
  // - draft(임시 저장): 이동 없음, 이후 저장이 update가 되도록 id만 사용
  // - completed(수업 기록 완료): 달력의 방금 저장한 일지 상세로 router.replace
  return {
    success: true as const,
    completed: parsed.data.status === "completed",
    dailyLogId: dailyLogId!,
    classDate: parsed.data.classDate,
  };
}

// 수업일지 삭제 (destructive — client에서 확인 dialog를 거친 뒤 호출).
// 성공 시 class_date를 돌려줘 삭제 후에도 같은 날짜 목록으로 돌아갈 수 있게 한다.
// [임시저장 삭제] — "작성 중인 일지" 목록의 특정 draft 하나를 버린다.
// kind=log: status='draft' 일지 row (서버에서 status 재검증 — 완료 일지는 거부)
// kind=autosave: daily_log_drafts row (JSON snapshot 하나 — child 없음)
// 항상 id 단건 기준. group/date 조건의 broad delete는 하지 않는다 (중복 draft 개별 정리).
export async function deleteWritingDraftAction(input: { kind: "log" | "autosave"; id: string }) {
  if (
    !input ||
    (input.kind !== "log" && input.kind !== "autosave") ||
    typeof input.id !== "string" ||
    input.id.length === 0
  ) {
    return { error: "임시저장을 삭제하지 못했어요. 다시 시도해주세요." };
  }

  try {
    if (input.kind === "log") {
      await deleteDraftDailyLog(input.id);
    } else {
      await deleteOwnedDailyLogDraft(input.id);
    }
  } catch (error) {
    console.error("deleteWritingDraftAction error", error);
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "임시저장을 삭제하지 못했어요. 다시 시도해주세요.",
    };
  }

  revalidatePath("/daily-logs");
  revalidatePath("/dashboard");
  // draft 일지에도 숙제/해야 할 일이 딸려 있을 수 있어 오늘 할 일 화면도 함께 갱신
  revalidatePath("/todos");
  if (input.kind === "log") {
    // draft 일지 row는 출결/미처리 보충/칭찬 정리를 동반하므로 관련 화면도 갱신
    revalidatePath("/makeups");
    revalidatePath("/students");
    revalidatePath("/groups");
  }

  return { success: true as const };
}

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
  // 일지를 지우면 딸린 숙제/해야 할 일도 사라지므로 오늘 할 일 화면도 갱신
  revalidatePath("/todos");
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
      // 패널은 학생 기록만 쓰므로 보충 조회는 생략 (버려지던 쿼리 1번 절감)
      getDailyLogDetailForCurrentUser(dailyLogId, { withMakeups: false }),
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
      homeworkDueDate: parsed.data.homeworkDueDate || null,
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

// 오늘 할 일 화면의 숙제 체크 — 숙제 row 자체의 completed만 토글한다.
// Todo 토글(togglePreparationItemAction)과는 완전히 분리된 액션이라
// 숙제 id가 Todo 경로로 넘어갈 수 없고, Todo row가 새로 생기지도 않는다.
// form action이라 반환값 없이 revalidate만 한다 (Todo 토글과 같은 방식):
// 낙관적 업데이트가 없으므로 저장이 실패하면 화면은 서버의 실제 상태 그대로 남는다.
export async function toggleHomeworkCompletionAction(homeworkId: string) {
  const result = await toggleHomeworkCompletion(homeworkId);

  if ("error" in result) {
    console.error("toggleHomeworkCompletionAction", result.error);
    return;
  }

  // 숙제가 보이는 화면만 갱신 (Dashboard의 Todo 카드는 숙제를 쓰지 않는다)
  revalidatePath("/todos");
  revalidatePath(`/daily-logs/${result.dailyLogId}`);
}
