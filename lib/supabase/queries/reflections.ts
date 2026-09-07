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
