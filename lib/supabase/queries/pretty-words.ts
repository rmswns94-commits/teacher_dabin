import { createServerSupabaseClient, getServerUser } from "@/lib/supabase/server";
import type { PrettyWordRecord } from "@/lib/supabase/types";

// 요청마다 Hero에 보여줄 문장 index를 고른다 (컴포넌트 렌더 밖의 헬퍼).
export function pickRandomHeroIndex(count: number) {
  return count > 0 ? Math.floor(Math.random() * count) : 0;
}

export async function getCurrentUserPrettyWords(limit = 100) {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    return [] as PrettyWordRecord[];
  }

  const { data, error } = await supabase
    .from("pretty_words")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getCurrentUserPrettyWords error", error);
    return [] as PrettyWordRecord[];
  }

  return (data ?? []) as PrettyWordRecord[];
}

async function requireOwnedContext() {
  const supabase = await createServerSupabaseClient();
  const user = await getServerUser();

  if (!supabase || !user) {
    throw new Error("로그인이 필요합니다.");
  }

  return { supabase, user };
}

export async function createPrettyWord(input: {
  content: string;
  author?: string | null;
  category?: string | null;
}) {
  const { supabase, user } = await requireOwnedContext();

  const { error } = await supabase.from("pretty_words").insert({
    user_id: user.id,
    content: input.content.trim(),
    author: input.author?.trim() || null,
    category: input.category || null,
  });

  if (error) {
    console.error("createPrettyWord error", error);
    throw new Error("문장을 저장하지 못했어요. 다시 시도해주세요.");
  }

  return true;
}

export async function updatePrettyWord(
  wordId: string,
  input: { content: string; author?: string | null; category?: string | null },
) {
  const { supabase, user } = await requireOwnedContext();

  const { error } = await supabase
    .from("pretty_words")
    .update({
      content: input.content.trim(),
      author: input.author?.trim() || null,
      category: input.category || null,
    })
    .eq("id", wordId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updatePrettyWord error", error);
    throw new Error("문장을 수정하지 못했어요.");
  }

  return true;
}

export async function setPrettyWordFavorite(wordId: string, isFavorite: boolean) {
  const { supabase, user } = await requireOwnedContext();

  const { error } = await supabase
    .from("pretty_words")
    .update({ is_favorite: isFavorite })
    .eq("id", wordId)
    .eq("user_id", user.id);

  if (error) {
    console.error("setPrettyWordFavorite error", error);
    throw new Error("즐겨찾기를 저장하지 못했어요.");
  }

  return true;
}

export async function deletePrettyWord(wordId: string) {
  const { supabase, user } = await requireOwnedContext();

  const { error } = await supabase
    .from("pretty_words")
    .delete()
    .eq("id", wordId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deletePrettyWord error", error);
    throw new Error("문장을 지우지 못했어요.");
  }

  return true;
}
