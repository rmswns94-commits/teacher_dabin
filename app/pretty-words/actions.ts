"use server";

import { revalidatePath } from "next/cache";

import {
  createPrettyWord,
  deletePrettyWord,
  setPrettyWordFavorite,
  updatePrettyWord,
} from "@/lib/supabase/queries/pretty-words";
import { prettyWordSchema } from "@/lib/validation/pretty-word";

type ActionResult = { error: string } | { success: true };

function friendlyError(error: unknown, fallback: string) {
  return { error: error instanceof Error && error.message ? error.message : fallback };
}

export async function createPrettyWordAction(input: {
  content: string;
  author?: string;
  category?: string;
}): Promise<ActionResult> {
  const parsed = prettyWordSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 확인해주세요." };
  }

  try {
    await createPrettyWord({
      content: parsed.data.content,
      author: parsed.data.author || null,
      category: parsed.data.category || null,
    });
  } catch (error) {
    return friendlyError(error, "문장을 저장하지 못했어요.");
  }

  revalidatePath("/pretty-words");
  return { success: true };
}

export async function updatePrettyWordAction(
  wordId: string,
  input: { content: string; author?: string; category?: string },
): Promise<ActionResult> {
  const parsed = prettyWordSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력 내용을 확인해주세요." };
  }

  try {
    await updatePrettyWord(wordId, {
      content: parsed.data.content,
      author: parsed.data.author || null,
      category: parsed.data.category || null,
    });
  } catch (error) {
    return friendlyError(error, "문장을 수정하지 못했어요.");
  }

  revalidatePath("/pretty-words");
  return { success: true };
}

export async function togglePrettyWordFavoriteAction(
  wordId: string,
  isFavorite: boolean,
): Promise<ActionResult> {
  try {
    await setPrettyWordFavorite(wordId, isFavorite);
  } catch (error) {
    return friendlyError(error, "즐겨찾기를 저장하지 못했어요.");
  }

  // revalidatePath 없음(의도): 하트는 클라이언트 낙관적 토글로 즉시 반영되고,
  // 페이지가 dynamic이라 다음 진입 시 서버 값이 어차피 새로 읽힌다.
  // revalidate를 하면 토글마다 페이지 전체 RSC 페이로드가 응답에 실려 와
  // 낙관적 업데이트의 이점이 사라진다.
  return { success: true };
}

export async function deletePrettyWordAction(wordId: string): Promise<ActionResult> {
  try {
    await deletePrettyWord(wordId);
  } catch (error) {
    return friendlyError(error, "문장을 지우지 못했어요.");
  }

  revalidatePath("/pretty-words");
  return { success: true };
}
