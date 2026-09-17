import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 학원 전체 휴강일 조회·저장.
// 조회는 전부 날짜 range batch다 — 그룹/수업마다 "이 날 휴강인가?"를 묻지 않는다(N+1 금지).
// 실패 시 빈 목록을 돌려줘 휴강일을 "없는 것"으로 보고 기존 시간표대로 동작한다(화면은 항상 뜬다).

// migration 미적용(테이블 없음)은 오류가 아니라 "휴강일 기능이 아직 꺼진 상태"다 —
// 읽기 경로에서는 조용히 빈 목록으로 두고, 저장 경로에서만 사용자에게 알린다.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

// 날짜 범위의 휴강일 (대시보드 오늘~+7일, 일지 캘린더 한 달, 일지 화면의 특정 날짜 등)
export async function getAcademyClosuresInRange(startDate: string, endDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as string[];
  }

  const { data, error } = await supabase
    .from("academy_closures")
    .select("closure_date")
    .eq("user_id", user.id)
    .gte("closure_date", startDate)
    .lte("closure_date", endDate);

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getAcademyClosuresInRange error", error);
    }
    return [] as string[];
  }

  return ((data ?? []) as { closure_date: string }[]).map((row) => row.closure_date);
}

// 학원 휴강일 등록 — 같은 학원의 같은 날짜에는 항상 하나.
// unique 위반(23505)은 "이미 휴강일"이라는 뜻이므로 성공으로 본다 — 더블 클릭에도 row가 늘지 않고,
// unique 컬럼 구성(학원 도입 전 user 단위 / 도입 후 학원 단위)에 의존하지 않는다.
export async function upsertAcademyClosure(date: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("academy_closures")
    .insert({ user_id: user.id, closure_date: date });

  if (error?.code === "23505") {
    return true;
  }

  if (error) {
    console.error("upsertAcademyClosure error", error);
    // 저장 경로에서는 미적용 원인을 숨기지 않는다 ("다시 시도"로 풀리지 않는 문제)
    throw new Error(
      isMissingTable(error)
        ? "학원 휴강일에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260919_create_academy_closures.sql을 실행한 뒤 다시 시도해주세요."
        : "학원 휴강을 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }

  return true;
}

// 휴강 해제 — 그 날짜 row만 지운다 (반복 시간표/개별 예외는 그대로).
export async function deleteAcademyClosure(date: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase
    .from("academy_closures")
    .delete()
    .eq("user_id", user.id)
    .eq("closure_date", date);

  if (error) {
    console.error("deleteAcademyClosure error", error);
    throw new Error(
      isMissingTable(error)
        ? "학원 휴강일에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260919_create_academy_closures.sql을 실행한 뒤 다시 시도해주세요."
        : "학원 휴강을 해제하지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }

  return true;
}

// 그 날짜에 이 사용자의 수업일지가 있는지 (학원 전체 휴강 안전 차단용).
// 반별로 묻지 않고 날짜 한 번만 조회한다.
export async function getDailyLogStatusesOnDate(date: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as { id: string; status: "draft" | "completed" }[];
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("class_date", date);

  if (error) {
    console.error("getDailyLogStatusesOnDate error", error);
    return [] as { id: string; status: "draft" | "completed" }[];
  }

  return (data ?? []) as { id: string; status: "draft" | "completed" }[];
}
