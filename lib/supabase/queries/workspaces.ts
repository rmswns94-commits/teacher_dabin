import { cache } from "react";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 학원(Workspace) — 한 계정이 여러 학원을 가질 수 있고, 업무 데이터는 학원 단위로 완전히 분리된다.
//
// 격리는 이 파일이 아니라 DB(RLS restrictive 정책 + workspace_id 기본값)가 강제한다.
// 그래서 다른 쿼리 파일들은 학원을 전혀 몰라도 되고, 필터를 빠뜨려 데이터가 새는 일이 없다.
// 여기서는 "지금 어떤 학원인가"를 읽고, 학원을 만들고, 전환하는 것만 담당한다.
//
// migration 미적용(테이블 없음)은 오류가 아니라 "학원 기능이 아직 꺼진 상태"다 —
// 조용히 null/빈 목록을 돌려주면 앱은 기존과 완전히 동일하게 동작한다.

export type WorkspaceRecord = {
  id: string;
  name: string;
  activatedAt: string;
  createdAt: string;
};

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

type WorkspaceRow = {
  id: string;
  name: string;
  activated_at: string;
  created_at: string;
};

function toRecord(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    activatedAt: row.activated_at,
    createdAt: row.created_at,
  };
}

// 활성 학원 = activated_at 이 가장 최근인 학원 (DB의 current_workspace_id()와 같은 규칙).
// 요청당 1회만 조회한다 (React cache) — 화면마다 다시 묻지 않는다.
export const getWorkspaces = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as WorkspaceRecord[];
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, activated_at, created_at")
    .eq("user_id", user.id)
    .order("activated_at", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    if (!isMissingTable(error)) {
      console.error("getWorkspaces error", error);
    }
    return [] as WorkspaceRecord[];
  }

  return ((data ?? []) as WorkspaceRow[]).map(toRecord);
});

export async function getActiveWorkspace() {
  const [active] = await getWorkspaces();
  return active ?? null;
}

// 신규 가입자는 아직 학원이 없다. 업무 데이터의 workspace_id 기본값이 활성 학원이라,
// 학원이 하나도 없으면 첫 INSERT가 실패한다 — 앱 진입 시(AppShell) 한 번 보장해준다.
// 이미 있으면 아무 것도 하지 않는다 (조회 1회).
//
// 첫 학원의 id는 사용자 id와 같게 고정한다. 첫 진입 때 여러 요청이 동시에 렌더되면
// 셋 다 "학원 없음"을 보고 각자 INSERT 해 같은 이름의 학원이 여러 개 생기는데,
// id가 같으면 PK 충돌(23505)로 하나만 남는다. 나중에 사용자가 직접 만드는 학원은
// 평소대로 랜덤 id를 쓴다.
export async function ensureActiveWorkspace() {
  const existing = await getActiveWorkspace();
  if (existing) {
    return existing;
  }

  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ id: user.id, user_id: user.id, name: "내 학원" })
    .select("id, name, activated_at, created_at")
    .maybeSingle();

  if (error) {
    // 동시 요청이 먼저 만든 경우 — 그 학원을 쓰면 된다
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("workspaces")
        .select("id, name, activated_at, created_at")
        .eq("id", user.id)
        .maybeSingle();

      return raced ? toRecord(raced as WorkspaceRow) : null;
    }

    // 테이블 미적용이면 조용히 넘어간다 (학원 기능만 꺼진 상태 — 앱은 기존대로 동작)
    if (!isMissingTable(error)) {
      console.error("ensureActiveWorkspace error", error);
    }
    return null;
  }

  return data ? toRecord(data as WorkspaceRow) : null;
}

// 새 학원 만들기 — 학원 row 1개만 만든다. 기존 학생/반/일지 등은 복사하지 않는다.
// activated_at 기본값이 now()라 만들자마자 활성 학원이 된다(전환 작업 불필요 = 원자적).
export async function createWorkspace(name: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ user_id: user.id, name })
    .select("id, name, activated_at, created_at")
    .maybeSingle();

  if (error) {
    console.error("createWorkspace error", error);
    throw new Error(
      isMissingTable(error)
        ? "학원 변경에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260920_create_workspaces.sql과 20260920_scope_data_to_workspaces.sql을 실행한 뒤 다시 시도해주세요."
        : "새 학원을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }

  if (!data) {
    throw new Error("새 학원을 만들지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  return toRecord(data as WorkspaceRow);
}

// 학원 전환 — activated_at 갱신 한 문장(RPC). 업무 데이터는 어떤 것도 바뀌지 않는다.
export async function activateWorkspace(workspaceId: string) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { error } = await supabase.rpc("activate_workspace", { p_workspace_id: workspaceId });

  if (error) {
    console.error("activateWorkspace error", error);
    throw new Error(
      isMissingTable(error) || error.code === "42883"
        ? "학원 변경에 필요한 데이터베이스 변경(migration)이 아직 적용되지 않았어요. Supabase SQL Editor에서 20260920_create_workspaces.sql과 20260920_scope_data_to_workspaces.sql을 실행한 뒤 다시 시도해주세요."
        : "학원을 전환하지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }

  return true;
}
