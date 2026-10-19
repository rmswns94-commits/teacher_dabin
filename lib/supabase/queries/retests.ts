import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { AssessmentCategory } from "@/lib/assessments";
import {
  ACTIVE_RETEST_STATUSES,
  planRetestSync,
  type ExistingRetest,
  type RetestSource,
  type RetestStatus,
} from "@/lib/retests";

// 재시험 관리 조회·저장 (student_retests — 20261019 migration).
// - 학원 격리와 소유 확인은 RLS가 강제한다 — 여기서는 user_id를 명시해 범위를 한 번 더 좁힌다.
// - 모든 조회는 batch다: 반/학생/재시험마다 따로 쿼리하지 않는다.
// - migration 미적용(테이블 없음)은 읽기에서는 "기능 꺼짐"으로 조용히 처리하고,
//   재시험 관리 화면과 상태 변경에서만 안내한다. 일지 저장은 막지 않는다.

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

export const RETEST_MIGRATION_MESSAGE =
  "재시험 관리에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20261019_create_student_retests.sql을 실행한 뒤 다시 시도해주세요.";

type ServerSupabase = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

export type RetestRecord = {
  id: string;
  student_id: string;
  student_lesson_log_id: string | null;
  assessment_id: string;
  category: AssessmentCategory;
  status: RetestStatus;
  group_id: string | null;
  class_date: string;
  total_questions: number | null;
  correct_count: number | null;
  progress_snapshot: string | null;
  last_checked_at: string | null;
  passed_at: string | null;
  created_at: string;
  // source 수업일지 (일지가 삭제됐으면 null)
  student_lesson_logs: { daily_log_id: string } | { daily_log_id: string }[] | null;
};

const COLUMNS =
  "id, student_id, student_lesson_log_id, assessment_id, category, status, group_id, class_date, total_questions, correct_count, progress_snapshot, last_checked_at, passed_at, created_at, student_lesson_logs(daily_log_id)";

export function dailyLogIdOf(row: RetestRecord) {
  const link = Array.isArray(row.student_lesson_logs) ? row.student_lesson_logs[0] : row.student_lesson_logs;
  return link?.daily_log_id ?? null;
}

// 진행중 재시험 (pending + failed). scope를 주면 "등록 당시 반 = groupId 이거나 그 반 학생"만 —
// 반 배정(현재 소속 기준)은 화면이 assignRetestGroups로 마저 거른다.
export async function getActiveRetestRows(scope?: { groupId: string; studentIds: readonly string[] }) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { available: true, rows: [] as RetestRecord[] };
  }

  let query = supabase
    .from("student_retests")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .in("status", [...ACTIVE_RETEST_STATUSES])
    .order("class_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (scope) {
    const ids = scope.studentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    query =
      ids.length > 0
        ? query.or(`group_id.eq.${scope.groupId},student_id.in.(${ids.join(",")})`)
        : query.eq("group_id", scope.groupId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error)) {
      return { available: false, rows: [] as RetestRecord[] };
    }
    console.error("getActiveRetestRows error", { code: error.code, message: error.message });
    throw new Error("재시험 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return { available: true, rows: (data ?? []) as unknown as RetestRecord[] };
}

// 통과 기록 — 최근 통과순, limit 단위 더 보기 (전체 이력을 한 번에 읽지 않는다)
export async function getPassedRetestRows(limit: number) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { available: true, rows: [] as RetestRecord[], hasMore: false };
  }

  const { data, error } = await supabase
    .from("student_retests")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("status", "passed")
    .order("passed_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (error) {
    if (isMissingTable(error)) {
      return { available: false, rows: [] as RetestRecord[], hasMore: false };
    }
    console.error("getPassedRetestRows error", { code: error.code, message: error.message });
    throw new Error("통과 기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  const rows = (data ?? []) as unknown as RetestRecord[];
  return { available: true, rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// [통과] / [미통과] — 진행중(pending/failed)인 것만 바꾼다. 이미 통과한 재시험은 되돌리지 않는다.
// 원래 시험 점수(student_lesson_logs)는 건드리지 않는다.
export async function setRetestResult(retestId: string, result: "passed" | "failed") {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("student_retests")
    .update(
      result === "passed"
        ? { status: "passed", passed_at: now, last_checked_at: now }
        : { status: "failed", last_checked_at: now },
    )
    .eq("id", retestId)
    .eq("user_id", user.id)
    .in("status", [...ACTIVE_RETEST_STATUSES])
    .select("id, status")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      throw new Error(RETEST_MIGRATION_MESSAGE);
    }
    console.error("setRetestResult error", { code: error.code, message: error.message });
    throw new Error("재시험 결과를 저장하지 못했어요. 다시 시도해주세요.");
  }
  if (!data) {
    throw new Error("이미 통과 처리됐거나 찾을 수 없는 재시험이에요. 화면을 새로고침해주세요.");
  }

  return data as { id: string; status: RetestStatus };
}

// 수업일지 Final Save sync — 이 일지의 학생 기록들에 대해 "재시험 필요" 표시와 재시험 목록을 맞춘다.
// 멱등: 같은 source는 unique라 다시 저장해도 1건. 미통과/통과는 상태·snapshot 모두 그대로 둔다.
// 해제된 표시는 아직 대기(pending)인 것만 cancelled로 (삭제 아님, 보충 수업 취소와 같은 의미).
export async function syncDailyLogRetests(
  supabase: ServerSupabase,
  userId: string,
  input: { lessonLogIds: readonly string[]; sources: readonly RetestSource[]; classDate: string; groupId: string },
) {
  if (input.lessonLogIds.length === 0) {
    return;
  }

  const { data: existingRows, error: readError } = await supabase
    .from("student_retests")
    .select(
      "id, student_lesson_log_id, assessment_id, status, class_date, group_id, category, total_questions, correct_count, progress_snapshot",
    )
    .eq("user_id", userId)
    .in("student_lesson_log_id", [...input.lessonLogIds]);

  if (readError) {
    if (isMissingTable(readError)) {
      // migration 전: 재시험 관리 기능만 꺼진 상태 — 일지 저장은 그대로 성공시킨다.
      return;
    }
    console.error("syncDailyLogRetests read error", { code: readError.code, message: readError.message });
    throw new Error("재시험 정보를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
  }

  const plan = planRetestSync({
    sources: input.sources,
    existing: (existingRows ?? []) as ExistingRetest[],
    classDate: input.classDate,
    groupId: input.groupId,
  });

  if (plan.inserts.length > 0) {
    // 동시에 두 번 저장돼도 중복이 생기지 않게 (unique 충돌은 무시)
    const { error } = await supabase
      .from("student_retests")
      .upsert(
        plan.inserts.map((row) => ({ ...row, user_id: userId })),
        { onConflict: "student_lesson_log_id,assessment_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("syncDailyLogRetests insert error", { code: error.code, message: error.message });
      throw new Error("재시험 정보를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
    }
  }

  // 대기 중인 등록의 source 정보 갱신 / 취소됐던 등록의 재등록 — 상태 조건을 걸어
  // 그 사이 다른 화면에서 통과/미통과로 바뀐 row는 건드리지 않는다. (보통 0~몇 건 — 바뀐 것만)
  for (const update of plan.updates) {
    const { error } = await supabase
      .from("student_retests")
      .update(update.values)
      .eq("id", update.id)
      .eq("user_id", userId)
      .eq("status", update.fromStatus);
    if (error) {
      console.error("syncDailyLogRetests update error", { code: error.code, message: error.message });
      throw new Error("재시험 정보를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
    }
  }

  if (plan.cancelIds.length > 0) {
    const { error } = await supabase
      .from("student_retests")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .in("id", plan.cancelIds)
      .eq("status", "pending");
    if (error) {
      console.error("syncDailyLogRetests cancel error", { code: error.code, message: error.message });
      throw new Error("재시험 정보를 저장하지 못했어요. 저장 버튼을 다시 눌러주세요.");
    }
  }
}

// 수업일지 삭제 전: 처리 전(대기/취소) 재시험만 함께 지운다. 미통과/통과 이력은 FK set null로
// 링크만 풀린 채 snapshot과 함께 남는다 (보충 수업 삭제 규칙과 같다).
export async function deleteUnprocessedRetests(supabase: ServerSupabase, userId: string, lessonLogIds: readonly string[]) {
  if (lessonLogIds.length === 0) {
    return;
  }
  const { error } = await supabase
    .from("student_retests")
    .delete()
    .eq("user_id", userId)
    .in("student_lesson_log_id", [...lessonLogIds])
    .in("status", ["pending", "cancelled"]);

  if (error && !isMissingTable(error)) {
    console.error("deleteUnprocessedRetests error", { code: error.code, message: error.message });
    throw new Error("재시험 기록을 정리하지 못했어요. 다시 시도해주세요.");
  }
}
