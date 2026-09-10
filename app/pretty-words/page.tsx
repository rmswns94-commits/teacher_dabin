import Link from "next/link";
import { BookOpenText, ChevronDown, Heart, MessageCircleHeart, Quote, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Doodle } from "@/components/doodle";
import { PrettyWordCard, PrettyWordCreateButton, PrettyWordsHero } from "@/components/pretty-words";
import { Card, CardContent } from "@/components/ui/card";
import {
  attitudeQuote,
  examPrepRules,
  gradeGuides,
  parentNote,
  philosophyAnchor,
  readingQuestionTypes,
  speakingMethod,
  studentPrinciples,
  teacherAttitudes,
} from "@/lib/constants/teaching-philosophy";
import { getCurrentUserPrettyWords, pickRandomHeroIndex } from "@/lib/supabase/queries/pretty-words";
import {
  prettyWordCategoryLabels,
  type PrettyWordCategory,
} from "@/lib/validation/pretty-word";
import { cn } from "@/lib/utils";

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="card-title text-[#3a2f2c]">{children}</h2>
      {sub ? <p className="mt-0.5 text-sm text-[#9a8b86]">{sub}</p> : null}
    </div>
  );
}

export default async function PhilosophyPage({
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
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="page-title flex items-center gap-2 text-[#2d2928]">
                교육 철학
                <Doodle kind="flower" className="h-5 w-5 text-[#dcb3c2]" />
              </h1>
              <p className="mt-1.5 text-sm text-[#7b746f]">흔들릴 때 다시 읽는 나의 지도 원칙</p>
            </div>
            <PrettyWordCreateButton label="문장 기록하기" />
          </div>

          {/* 빠른 이동 */}
          <div className="mb-6 flex flex-wrap gap-1.5">
            {[
              ["#attitude", "강사로서의 태도"],
              ["#principles", "13가지 원칙"],
              ["#grades", "학년별 눈높이"],
              ["#design", "수업 설계 참고"],
              ["#my-words", "마음에 남은 문장 ♥"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full border border-[#ece0db] bg-white px-3 py-1.5 text-xs font-medium text-[#7c6d69] transition hover:bg-[#faf6f3]"
              >
                {label}
              </a>
            ))}
          </div>

          {/* 앵커 문장 — 이 페이지의 심장 */}
          <Card className="mb-8 overflow-hidden border-[#f0dbe2] bg-gradient-to-br from-[#fdf7f9] via-[#fbf5fb] to-[#f4f8f4]">
            <CardContent className="relative p-6 md:p-8">
              <Quote aria-hidden className="absolute left-5 top-5 h-5 w-5 text-[#e3c3cf]" />
              <p className="mx-auto max-w-2xl text-center text-lg leading-relaxed text-[#4a3c47]">
                {philosophyAnchor.headline}
              </p>
              <p className="mt-3 text-center text-sm text-[#a08a94]">{philosophyAnchor.sub}</p>
            </CardContent>
          </Card>

          {/* 1. 강사로서의 태도 */}
          <section id="attitude" className="mb-8 scroll-mt-6">
            <SectionTitle>1. 강사로서의 태도</SectionTitle>
            <Card className="p-5">
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {teacherAttitudes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-5 text-[#4a4140]">
                    <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-[#c9a9de]" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <blockquote className="mt-4 whitespace-pre-line rounded-2xl border-l-4 border-[#d9b8c8] bg-[#fbf4f7] px-4 py-3 text-sm leading-7 text-[#6d5560]">
                {attitudeQuote}
              </blockquote>
            </Card>
          </section>

          {/* 2. 학생을 대하는 13가지 원칙 */}
          <section id="principles" className="mb-8 scroll-mt-6">
            <SectionTitle sub="번호가 아니라 마음의 순서예요 — 하나씩 몸에 배게.">
              2. 학생을 대하는 13가지 원칙
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {studentPrinciples.map((principle, index) => (
                <Card key={principle.title} className="p-4">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2edf9] text-xs font-bold tabular-nums text-[#6852b8]"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-5 text-[#2d2928]">
                        {principle.title}
                      </div>
                      {principle.detail ? (
                        <p className="secondary-text mt-0.5 text-[#6f6260]">
                          {principle.detail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* 3. 학년별 눈높이 */}
          <section id="grades" className="mb-8 scroll-mt-6">
            <SectionTitle>3. 학년별 눈높이</SectionTitle>
            <div className="space-y-2.5">
              {gradeGuides.map((guide) => (
                <Card key={guide.target} className="p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                    <span className="w-fit shrink-0 rounded-full bg-[#f2edf9] px-3 py-1 text-xs font-semibold text-[#5f54b8] md:mt-0.5 md:w-16 md:text-center">
                      {guide.target}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm leading-5 text-[#4a4140]">{guide.core}</p>
                      <p className="secondary-text text-[#a26660]">
                        <span className="font-medium">주의</span> · {guide.caution}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#dcebe2] bg-[#f4faf7] px-4 py-3 text-sm leading-5 text-[#3f6b58]">
              <MessageCircleHeart className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {parentNote}
            </div>
          </section>

          {/* 4. 수업 설계 참고 — 접이식 참고 자료 */}
          <section id="design" className="mb-10 scroll-mt-6">
            <SectionTitle sub="필요할 때 펼쳐 보는 수업 도구 상자">4. 수업 설계 참고</SectionTitle>
            <div className="space-y-2.5">
              <details className="group rounded-3xl border border-[#efe4dc] bg-[#fffdfb] open:shadow-sm">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 text-sm font-semibold text-[#2d2928] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <BookOpenText className="h-4 w-4 text-[#3e7d6b]" aria-hidden />
                    {speakingMethod.title}
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#9a8b86] transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-3 px-5 pb-5 text-sm leading-7 text-[#4a4140]">
                  <p>{speakingMethod.intro}</p>
                  <div className="rounded-2xl bg-[#f4faf7] px-4 py-3 font-medium text-[#33574a]">
                    {speakingMethod.example}
                    <div className="mt-1 font-normal text-[#4f7565]">{speakingMethod.connect}</div>
                  </div>
                  <ol className="space-y-1.5">
                    {speakingMethod.steps.map((step, index) => (
                      <li key={step} className="flex items-start gap-2">
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e4f4ec] text-xs font-bold tabular-nums text-[#3d7f64]"
                        >
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p className="secondary-text font-medium text-[#5c4ca8]">⇒ {speakingMethod.outcome}</p>
                </div>
              </details>

              <details className="group rounded-3xl border border-[#efe4dc] bg-[#fffdfb] open:shadow-sm">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 text-sm font-semibold text-[#2d2928] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <BookOpenText className="h-4 w-4 text-[#6852b8]" aria-hidden />
                    내신 · 수능 독해 15가지 문제 유형
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#9a8b86] transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="px-5 pb-5">
                  <ol className="grid gap-x-6 gap-y-1.5 text-sm leading-5 text-[#4a4140] sm:grid-cols-2 lg:grid-cols-3">
                    {readingQuestionTypes.map((type, index) => (
                      <li key={type} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-right text-sm tabular-nums text-[#a79996]">
                          {index + 1}
                        </span>
                        {type}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>

              <details className="group rounded-3xl border border-[#efe4dc] bg-[#fffdfb] open:shadow-sm">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 text-sm font-semibold text-[#2d2928] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <BookOpenText className="h-4 w-4 text-[#a26660]" aria-hidden />
                    시험 대비 운영 원칙
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#9a8b86] transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="px-5 pb-5">
                  <ul className="space-y-1.5 text-sm leading-5 text-[#4a4140]">
                    {examPrepRules.map((rule) => (
                      <li key={rule} className="flex items-start gap-2">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d9a79a]" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </div>
          </section>

          {/* 5. 마음에 남은 문장 — 계속 쌓아가는 기록 (기존 이쁜 말 컬렉션) */}
          <section id="my-words" className="scroll-mt-6 border-t border-dashed border-[#e9dcd4] pt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <SectionTitle sub="수업하며 만난 문장과 생각을 여기에 계속 쌓아가요.">
                마음에 남은 문장 <span aria-hidden className="text-[#d97b9a]">♥</span>
              </SectionTitle>
              {words.length > 0 ? <PrettyWordCreateButton label="문장 기록하기" /> : null}
            </div>

            {words.length === 0 ? (
              <div className="relative">
                <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[28px] border border-[#f0dbe2] bg-gradient-to-br from-[#fdf7f9] to-[#fdfaf5] px-6 py-12 text-center">
                  <div className="body-text text-[#4a3f47]">아직 모아둔 문장이 없어요.</div>
                  <p className="text-sm leading-5 text-[#8a7b83]">
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
                  <Link href="/pretty-words#my-words" className={chipClass(!favoriteOnly && !categoryFilter)}>
                    전체
                  </Link>
                  <Link
                    href="/pretty-words?filter=favorite#my-words"
                    className={cn(chipClass(favoriteOnly), "inline-flex items-center gap-1")}
                  >
                    <Heart className="h-3 w-3" aria-hidden /> 좋아하는 말
                  </Link>
                  {usedCategories.map((category) => (
                    <Link
                      key={category}
                      href={`/pretty-words?category=${category}#my-words`}
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
          </section>
        </div>
      </main>
    </AppShell>
  );
}
