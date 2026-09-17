"use server";

import { revalidatePath } from "next/cache";

import {
  activateWorkspace,
  createWorkspace,
  getWorkspaces,
} from "@/lib/supabase/queries/workspaces";

// 학원(Workspace) 만들기 / 전환.
// - 새 학원을 만들어도 기존 학생·반·수업일지 등은 한 줄도 복사하거나 옮기지 않는다.
//   학원 row 1개만 생기고, 그 학원은 완전히 빈 상태로 시작한다.
// - 전환도 activated_at 한 번 갱신일 뿐이라 업무 데이터는 어떤 것도 바뀌지 않는다.
// - 실패하면 현재 학원을 그대로 유지하고 이유만 알린다 (성공한 척 하지 않는다).

const MAX_NAME = 40;

// 학원이 바뀌면 화면에 남아 있던 이전 학원 데이터가 잠깐이라도 보이면 안 된다.
// 페이지가 전부 dynamic이라 다시 들어가는 화면은 항상 fresh지만,
// 클라이언트 라우터 캐시(뒤로 가기 등)까지 확실히 비운다. 글꼴/테마 같은 기기 설정은 그대로다.
function revalidateEverything() {
  revalidatePath("/", "layout");
}

export async function createWorkspaceAction(input: {
  name: string;
}): Promise<{ error: string } | { success: true; name: string }> {
  const name = input.name.trim();

  if (!name) {
    return { error: "학원 이름을 입력해주세요." };
  }

  if (name.length > MAX_NAME) {
    return { error: `학원 이름은 ${MAX_NAME}자 이내로 입력해주세요.` };
  }

  try {
    const workspace = await createWorkspace(name);
    revalidateEverything();
    return { success: true, name: workspace.name };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "새 학원을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }
}

export async function activateWorkspaceAction(input: {
  workspaceId: string;
}): Promise<{ error: string } | { success: true; name: string }> {
  const workspaces = await getWorkspaces();
  const target = workspaces.find((workspace) => workspace.id === input.workspaceId);

  if (!target) {
    return { error: "학원을 찾을 수 없어요." };
  }

  if (workspaces[0]?.id === target.id) {
    // 이미 현재 학원 — 아무 것도 바꾸지 않는다
    return { success: true, name: target.name };
  }

  try {
    await activateWorkspace(target.id);
    revalidateEverything();
    return { success: true, name: target.name };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "학원을 전환하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }
}
