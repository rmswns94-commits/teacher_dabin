"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";

// 저장된 데이터 전부 초기화 — Settings의 명시적 2단계 확인("초기화" 입력) flow에서만 호출된다.
// 실제 삭제는 DB 함수 reset_teacher_workspace() 한 번 호출 = 단일 트랜잭션(all or nothing).
// 함수는 내부에서 auth.uid()만 사용하므로 user id를 인자로 받지 않는다 —
// 다른 사용자의 데이터는 구조적으로 삭제할 수 없다 (RLS delete 정책도 그대로 적용됨).
// 계정(auth.users)/로그인 세션/베타 피드백은 삭제 대상이 아니다.
export async function resetTeacherWorkspaceAction(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return { error: "로그인이 필요해요." };
  }

  const { error } = await supabase.rpc("reset_teacher_workspace");

  if (error) {
    // 함수 미적용(migration 미실행)/일시 오류 모두 여기로 — raw error는 노출하지 않는다
    console.error("resetTeacherWorkspaceAction error", error);
    return { error: "데이터를 초기화하지 못했어요. 잠시 후 다시 시도해주세요." };
  }

  // 삭제 전 데이터가 라우터 캐시에 남아 잠깐이라도 보이지 않게 전체 revalidate.
  // 페이지들이 전부 dynamic이라 이후 이동하는 화면은 항상 fresh지만, 클라이언트
  // 라우터 캐시(뒤로 가기 등)까지 확실히 비우기 위한 안전망이다.
  revalidatePath("/", "layout");
  return { ok: true };
}
