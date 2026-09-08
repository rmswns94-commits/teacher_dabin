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

// [수업 일지 작성하기] 공용 진입 정책: 작성 중인 일지가 있으면 이어쓸 화면 href를 돌려준다
// (없으면 null → 새 작성 화면). 후보는 두 층위 —
//   ① 수동 [임시저장]으로 만든 daily_logs(status='draft') → /daily-logs/{id}/edit
//   ② 자동 임시저장 daily_log_drafts (새 작성 identity) → /daily-logs/new?groupId&date&resume=1
// "가장 최근에 실제로 수정한 작업"이 우선: updated_at desc (daily_logs는 DB trigger가 갱신,
// drafts는 upsert가 매번 기록), 동시각 tie는 id desc. finalized(completed)는 절대 대상 아님.
// 조회 2회만 수행하고 어떤 row도 만들지 않는다 (클릭/더블클릭으로 draft 중복 생성 불가).
export async function getActiveDraftResumeTarget(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const [logResult, draftResult] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("id, updated_at")
      .eq("user_id", user.id)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    supabase
      .from("daily_log_drafts")
      .select("daily_log_id, group_id, class_date, updated_at, daily_logs(status)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
  ]);

  // 조회 실패 시 resume을 포기하고 새 작성 화면으로 (페이지가 깨지지 않게)
  if (logResult.error) {
    console.error("getActiveDraftResumeTarget logs error", {
      code: logResult.error.code,
      message: logResult.error.message,
    });
  }
  if (draftResult.error) {
    console.error("getActiveDraftResumeTarget drafts error", {
      code: draftResult.error.code,
      message: draftResult.error.message,
    });
  }

  const draftLog = (logResult.data ?? [])[0] ?? null;

  // 자동 임시저장 중 유효한 최신 1개.
  // 수정 draft(daily_log_id 있음)는 원본 일지가 아직 draft일 때만 유효 —
  // final 저장이 draft를 정리하지만, 혹시 남은 완료 일지의 잔재는 스킵한다 (stale resume 방지).
  let autosave: { href: string; updatedAt: string } | null = null;
  const draftRows = (draftResult.data ?? []) as unknown as {
    daily_log_id: string | null;
    group_id: string;
    class_date: string;
    updated_at: string;
    daily_logs: { status?: string } | { status?: string }[] | null;
  }[];

  for (const row of draftRows) {
    if (row.daily_log_id) {
      const linked = Array.isArray(row.daily_logs) ? row.daily_logs[0] : row.daily_logs;
      if (linked?.status !== "draft") {
        continue;
      }
      autosave = { href: `/daily-logs/${row.daily_log_id}/edit`, updatedAt: row.updated_at };
    } else {
      autosave = {
        href: `/daily-logs/new?groupId=${row.group_id}&date=${row.class_date}&resume=1`,
        updatedAt: row.updated_at,
      };
    }
    break;
  }

  if (draftLog && autosave) {
    return Date.parse(autosave.updatedAt) > Date.parse(draftLog.updated_at)
      ? autosave.href
      : `/daily-logs/${draftLog.id}/edit`;
  }
  if (draftLog) {
    return `/daily-logs/${draftLog.id}/edit`;
  }
  return autosave ? autosave.href : null;
}

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
