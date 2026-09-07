import { REFLECTION_NOT_EMPTY } from "@/lib/supabase/queries/daily-logs";
import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { ClassGroupRecord } from "@/lib/supabase/types";

// 수업 회고 캘린더용 쿼리. source of truth는 daily_logs의 reflection_good/hard/next —
// 별도 요약 table 없이 query-time aggregation만 사용한다.
// 날짜 귀속은 항상 class_date(수업 날짜) 기준 (created_at 아님 — 과거 일지 backfill도 그 날짜로).
// 기존 정책대로 draft 일지의 회고도 포함한다 (회고는 일지 상태와 무관한 강사 기록).

function pickOne<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
}

// 월간 marker: 회고가 하나라도 있는 일지의 id/날짜만 lightweight로 (본문 미전송, 쿼리 1번)
export async function getMonthlyReflectionMarkers(monthStart: string, monthEnd: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [] as { id: string; class_date: string }[], failed: false };
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select("id, class_date")
    .eq("user_id", user.id)
    .or(REFLECTION_NOT_EMPTY)
    .gte("class_date", monthStart)
    .lte("class_date", monthEnd)
    .order("class_date", { ascending: true });

  if (error) {
    console.error("getMonthlyReflectionMarkers error", { code: error.code, message: error.message });
    return { rows: [] as { id: string; class_date: string }[], failed: true };
  }

  return { rows: (data ?? []) as { id: string; class_date: string }[], failed: false };
}

export type DayReflectionRow = {
  id: string;
  class_date: string;
  group_id: string;
  reflection_good: string | null;
  reflection_hard: string | null;
  reflection_next: string | null;
  group: Pick<ClassGroupRecord, "id" | "name" | "icon"> | null;
};

// 월 누적 회고: 기간 내 회고 전체를 그룹 embed와 함께 1쿼리 batch (반별/일별 반복 쿼리 금지).
// 정렬은 class_date asc → created_at asc (deterministic).
export async function getReflectionsForRange(startDate: string, endDate: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [] as DayReflectionRow[], failed: false };
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select(
      "id, class_date, group_id, reflection_good, reflection_hard, reflection_next, class_groups(id, name, icon)",
    )
    .eq("user_id", user.id)
    .gte("class_date", startDate)
    .lte("class_date", endDate)
    .or(REFLECTION_NOT_EMPTY)
    .order("class_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getReflectionsForRange error", { code: error.code, message: error.message });
    return { rows: [] as DayReflectionRow[], failed: true };
  }

  const rows = (data ?? []).map((row) => ({
    ...(row as unknown as Omit<DayReflectionRow, "group">),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name" | "icon">>(row.class_groups),
  }));

  return { rows, failed: false };
}

export type ReflectionSlimRow = {
  id: string;
  class_date: string;
  reflection_good: string | null;
  reflection_hard: string | null;
  reflection_next: string | null;
};

// 전체 누적 회고의 초기 로드: 회고 텍스트+날짜만 (그룹/학생 등 불필요 필드 미조회 — §최소 데이터).
// PostgREST 기본 1000행 제한을 넘겨도 안전하게 1000행 단위 페이징 loop로 전부 수집한다.
// aggregate(기간/통계/월별/자주 적은 문구)는 서버에서 계산하고 DOM에는 요약만 내린다.
export async function getAllReflectionSlims() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [] as ReflectionSlimRow[], failed: false };
  }

  const PAGE = 1000;
  const MAX_ROWS = 20000; // 안전 상한 (loop 폭주 방지)
  const rows: ReflectionSlimRow[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("daily_logs")
      .select("id, class_date, reflection_good, reflection_hard, reflection_next")
      .eq("user_id", user.id)
      .or(REFLECTION_NOT_EMPTY)
      .order("class_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("getAllReflectionSlims error", { code: error.code, message: error.message });
      return { rows: [] as ReflectionSlimRow[], failed: true };
    }

    rows.push(...((data ?? []) as ReflectionSlimRow[]));

    if (!data || data.length < PAGE) {
      break;
    }
  }

  return { rows, failed: false };
}

// 선택한 날짜의 회고 전체 (그룹 embed로 batch — 반별 반복 쿼리 금지)
export async function getReflectionsForDate(date: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { rows: [] as DayReflectionRow[], failed: false };
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .select(
      "id, class_date, group_id, reflection_good, reflection_hard, reflection_next, class_groups(id, name, icon)",
    )
    .eq("user_id", user.id)
    .eq("class_date", date)
    .or(REFLECTION_NOT_EMPTY)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getReflectionsForDate error", { code: error.code, message: error.message });
    return { rows: [] as DayReflectionRow[], failed: true };
  }

  const rows = (data ?? []).map((row) => ({
    ...(row as unknown as Omit<DayReflectionRow, "group">),
    group: pickOne<Pick<ClassGroupRecord, "id" | "name" | "icon">>(row.class_groups),
  }));

  return { rows, failed: false };
}
