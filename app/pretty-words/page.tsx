import Link from "next/link";
import { Heart } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Doodle } from "@/components/doodle";
import { PrettyWordCard, PrettyWordCreateButton, PrettyWordsHero } from "@/components/pretty-words";
import { getCurrentUserPrettyWords, pickRandomHeroIndex } from "@/lib/supabase/queries/pretty-words";
import {
  prettyWordCategoryLabels,
  type PrettyWordCategory,
} from "@/lib/validation/pretty-word";
import { cn } from "@/lib/utils";

export default async function PrettyWordsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string; category?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const favoriteOnly = params.filter === "favorite";
  const categoryFilter = params.category || null;

  const words = await getCurrentUserPrettyWords();
  // 요청마다 서버에서 한 번만 고르므로 페이지 내 상태 변화에 영향받지 않는다.
  const heroIndex = pickRandomHeroIndex(words.length);

  const usedCategories = [...new Set(words.map((word) => word.category).filter(Boolean))] as string[];

  const visibleWords = words.filter((word) => {
    if (favoriteOnly && !word.is_favorite) {
      return false;
    }

    if (categoryFilter && word.category !== categoryFilter) {
      return false;
    }

    return true;
  });

  const chipClass = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
      active
        ? "border-[#e3c9d6] bg-[#fbeff4] text-[#a05a7c]"
        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
    );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1000px]">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-display text-[26px] font-semibold tracking-[-0.01em] text-[#2d2928] md:text-3xl">
                이쁜 말<span aria-hidden className="text-[#d97b9a]">♥</span>
                <Doodle kind="flower" className="h-5 w-5 text-[#dcb3c2]" />
              </h1>
              <p className="mt-1.5 text-sm text-[#7b746f]">마음에 남은 문장을 하나씩 모아두는 곳</p>
            </div>
            {words.length > 0 ? <PrettyWordCreateButton /> : null}
          </div>

          {words.length === 0 ? (
            <div className="relative mt-10">
              <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[28px] border border-[#f0dbe2] bg-gradient-to-br from-[#fdf7f9] to-[#fdfaf5] px-6 py-12 text-center">
                <div className="font-display text-lg text-[#4a3f47]">아직 모아둔 문장이 없어요.</div>
                <p className="text-sm leading-6 text-[#8a7b83]">
                  오늘 마음에 남은 한마디를
                  <br />첫 페이지에 적어볼까요?
                </p>
                <PrettyWordCreateButton label="첫 문장 남기기" />
              </div>
            </div>
          ) : (
            <>
              <PrettyWordsHero
                words={words.map((word) => ({ id: word.id, content: word.content, author: word.author }))}
                initialIndex={heroIndex}
              />

              <div className="mt-6 flex flex-wrap items-center gap-1.5">
                <Link href="/pretty-words" className={chipClass(!favoriteOnly && !categoryFilter)}>
                  전체
                </Link>
                <Link
                  href="/pretty-words?filter=favorite"
                  className={cn(chipClass(favoriteOnly), "inline-flex items-center gap-1")}
                >
                  <Heart className="h-3 w-3" aria-hidden /> 좋아하는 말
                </Link>
                {usedCategories.map((category) => (
                  <Link
                    key={category}
                    href={`/pretty-words?category=${category}`}
                    className={chipClass(categoryFilter === category)}
                  >
                    {prettyWordCategoryLabels[category as PrettyWordCategory] ?? category}
                  </Link>
                ))}
              </div>

              {visibleWords.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-[#faf5f0] p-6 text-center text-sm text-[#655d5d]">
                  {favoriteOnly ? "아직 좋아요한 문장이 없어요 ♡" : "이 분류에는 아직 문장이 없어요."}
                </div>
              ) : (
                <div className="mt-6 grid gap-4 pb-10 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleWords.map((word) => (
                    <PrettyWordCard key={word.id} word={word} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
