import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 수업일지 자동 임시저장 draft. daily_logs와 분리된 snapshot이라
// 저장해도 학생 기록/칭찬/보충/연동 Todo/캘린더/성장노트에 영향이 없다.
// (final 저장 시에만 기존 saveDailyLog 경로가 side effect를 수행하고 draft를 정리한다)

export type DailyLogDraftRecord = {
  id: string;
  daily_log_id: string | null;
  group_id: string;
  class_date: string;
  payload: unknown;
  updated_at: string;
};

const DRAFT_FIELDS = "id, daily_log_id, group_id, class_date, payload, updated_at";

// identity로 기존 draft 조회 — 새 작성은 (group, date), 수정은 daily_log_id 기준
export async function getDailyLogDraft(identity: {
  dailyLogId?: string | null;
  groupId?: string;
  classDate?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  let query = supabase
    .from("daily_log_drafts")
    .select(DRAFT_FIELDS)
    .eq("user_id", user.id);

  if (identity.dailyLogId) {
    query = query.eq("daily_log_id", identity.dailyLogId);
  } else if (identity.groupId && identity.classDate) {
    query = query
      .is("daily_log_id", null)
      .eq("group_id", identity.groupId)
      .eq("class_date", identity.classDate);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("getDailyLogDraft error", error);
    return null;
  }

  return (data as DailyLogDraftRecord | null) ?? null;
}

// 같은 draft id로 계속 UPDATE (1분마다 새 row를 만들지 않는다).
// 첫 저장은 insert — unique index 충돌(다른 탭/이전 세션 draft)이면 그 row를 update.
export async function upsertDailyLogDraft(input: {
  draftId: string | null;
  dailyLogId: string | null;
  groupId: string;
  classDate: string;
  payload: unknown;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const now = new Date().toISOString();

  if (input.draftId) {
    const { data, error } = await supabase
      .from("daily_log_drafts")
      .update({ payload: input.payload, class_date: input.classDate, updated_at: now })
      .eq("id", input.draftId)
      .eq("user_id", user.id)
      .select("id, updated_at")
      .maybeSingle();

    if (!error && data) {
      return { draftId: data.id as string, updatedAt: data.updated_at as string };
    }
    // draft가 사라진 경우(다른 탭에서 버림 등) → 아래에서 새로 insert
  }

  const insertPayload = {
    user_id: user.id,
    daily_log_id: input.dailyLogId,
    group_id: input.groupId,
    class_date: input.classDate,
    payload: input.payload,
    updated_at: now,
  };

  const { data: created, error: insertError } = await supabase
    .from("daily_log_drafts")
    .insert(insertPayload)
    .select("id, updated_at")
    .single();

  if (!insertError && created) {
    return { draftId: created.id as string, updatedAt: created.updated_at as string };
  }

  // 동일 identity draft가 이미 존재 (unique index) → 그 row를 이어서 사용
  if (insertError?.code === "23505") {
    const existing = await getDailyLogDraft(
      input.dailyLogId
        ? { dailyLogId: input.dailyLogId }
        : { groupId: input.groupId, classDate: input.classDate },
    );

    if (existing) {
      const { data, error } = await supabase
        .from("daily_log_drafts")
        .update({ payload: input.payload, updated_at: now })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .select("id, updated_at")
        .single();

      if (!error && data) {
        return { draftId: data.id as string, updatedAt: data.updated_at as string };
      }
    }
  }

  console.error("upsertDailyLogDraft error", insertError);
  throw new Error("임시저장하지 못했어요.");
}

export async function deleteDailyLogDraftById(draftId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return;
  }

  const { error } = await supabase
    .from("daily_log_drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteDailyLogDraftById error", error);
  }
}

// final 저장/일지 삭제 후 stale draft 정리 (해당 identity 전부)
export async function deleteDailyLogDraftsForIdentity(identity: {
  dailyLogId?: string | null;
  groupId?: string;
  classDate?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return;
  }

  let query = supabase.from("daily_log_drafts").delete().eq("user_id", user.id);

  if (identity.dailyLogId) {
    query = query.eq("daily_log_id", identity.dailyLogId);
  } else if (identity.groupId && identity.classDate) {
    query = query
      .is("daily_log_id", null)
      .eq("group_id", identity.groupId)
      .eq("class_date", identity.classDate);
  } else {
    return;
  }

  const { error } = await query;

  if (error) {
    console.error("deleteDailyLogDraftsForIdentity error", error);
  }
}
