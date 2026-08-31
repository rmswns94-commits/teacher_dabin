"use client";

import { useRouter } from "next/navigation";
import { Ellipsis, Heart, Pencil, Plus, Quote, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  createPrettyWordAction,
  deletePrettyWordAction,
  togglePrettyWordFavoriteAction,
  updatePrettyWordAction,
} from "@/app/pretty-words/actions";
import { Doodle, Tape } from "@/components/doodle";
import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import type { PrettyWordRecord } from "@/lib/supabase/types";
import {
  prettyWordCategories,
  prettyWordCategoryLabels,
  type PrettyWordCategory,
} from "@/lib/validation/pretty-word";
import { cn } from "@/lib/utils";

/* ---------- Hero: 오늘 꺼내본 문장 ---------- */

export function PrettyWordsHero({
  words,
  initialIndex,
}: {
  words: { id: string; content: string; author: string | null }[];
  initialIndex: number;
}) {
  // 서버가 고른 초기 index를 그대로 사용하므로 hydration mismatch가 없고,
  // 페이지 내 다른 상태 변화에도 문장이 바뀌지 않는다. 버튼으로만 변경.
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(words.length - 1, 0)));
  const word = words[index];

  const showAnother = () => {
    if (words.length < 2) {
      return;
    }

    let next = index;
    while (next === index) {
      next = Math.floor(Math.random() * words.length);
    }
    setIndex(next);
  };

  if (!word) {
    return null;
  }

  return (
    <div className="relative">
      <Tape className="bg-[#e6ddf5]/85" />
      <div className="dot-pattern absolute inset-y-0 right-0 w-1/4 rounded-r-[28px] opacity-50" aria-hidden />
      <div className="relative overflow-hidden rounded-[28px] border border-[#e8ddf3] bg-gradient-to-br from-[#fbf8ff] via-[#fdf9f4] to-[#fff6ee] px-6 py-7 text-center shadow-[0_10px_30px_rgba(139,122,230,0.07)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a493c9]">
          오늘 꺼내본 문장
        </div>

        <p className="mx-auto mt-4 max-w-xl whitespace-pre-line font-display text-[23px] leading-9 text-[#443b4f]">
          {word.content}
        </p>

        {word.author ? (
          <div className="mt-2 text-xs text-[#8a7b8f]">— {word.author}</div>
        ) : null}

        <div className="mt-4 flex items-center justify-center gap-2">
          <Doodle kind="flower" className="h-4 w-4 text-[#d8c6da]" />
          {words.length > 1 ? (
            <button
              type="button"
              onClick={showAnother}
              className="flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs text-[#8f7fae] transition hover:bg-white/70 hover:text-[#5d5370]"
            >
              다른 문장 보기 <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- 등록/수정 공용 폼 다이얼로그 ---------- */

function WordFormDialog({
  title,
  initial,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: { content: string; author: string; category: string };
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: { content: string; author: string; category: string }) => void;
}) {
  const [content, setContent] = useState(initial.content);
  const [author, setAuthor] = useState(initial.author);
  const [category, setCategory] = useState(initial.category);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="font-display text-base font-semibold text-[#2a2323]">{title}</div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">문장</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder="오늘도 충분히 잘했어."
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">누가 한 말인가요? (선택)</span>
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            maxLength={100}
            placeholder="학생 / 책 / 작가 이름 / 나"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">분류 (선택)</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="">분류 없음</option>
            {prettyWordCategories.map((value) => (
              <option key={value} value={value}>{prettyWordCategoryLabels[value]}</option>
            ))}
          </select>
        </label>

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onCancel}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !content.trim()}
            onClick={() => onSubmit({ content, author, category })}
          >
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 등록 버튼 ---------- */

export function PrettyWordCreateButton({ label = "이쁜 말 등록하기" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (values: { content: string; author: string; category: string }) => {
    setError("");
    startTransition(async () => {
      const result = await createPrettyWordAction(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setSavedMessage("예쁜 문장을 하나 더 모았어요 ♡");
      setTimeout(() => setSavedMessage(""), 2500);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      {savedMessage ? <span className="text-xs text-[#a06b8a]">{savedMessage}</span> : null}
      <Button
        type="button"
        className="gap-2"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> {label}
      </Button>

      {open ? (
        <WordFormDialog
          title="새 문장 남기기"
          initial={{ content: "", author: "", category: "" }}
          isPending={isPending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}

/* ---------- 문장 카드 ---------- */

const noteVariants = [
  { card: "border-[#eadfd8] bg-[#fffdfb]", accent: "text-[#c9bce8]" },
  { card: "border-[#e8ddf3] bg-[#fbf8ff]", accent: "text-[#c3b2e6]" },
  { card: "border-[#e0eee6] bg-[#f7fcf9]", accent: "text-[#a4cdb8]" },
  { card: "border-[#f2ddcf] bg-[#fff8f3]", accent: "text-[#e3bfa4]" },
  { card: "border-[#f0dbe2] bg-[#fdf7f9]", accent: "text-[#dcb3c2]" },
];

function hashId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function PrettyWordCard({ word }: { word: PrettyWordRecord }) {
  const router = useRouter();
  const hash = hashId(word.id);
  const variant = noteVariants[hash % noteVariants.length];
  const hasTape = hash % 4 === 0;
  const doodleKind = hash % 5 === 1 ? "flower" : hash % 5 === 3 ? "sparkle" : null;

  const [favorite, setFavorite] = useState(word.is_favorite);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next); // optimistic
    startTransition(async () => {
      const result = await togglePrettyWordFavoriteAction(word.id, next);

      if ("error" in result) {
        setFavorite(!next);
        setError(result.error);
        setTimeout(() => setError(""), 2500);
      }
    });
  };

  const remove = () => {
    if (!window.confirm("이 문장을 지울까요?")) {
      return;
    }

    startTransition(async () => {
      const result = await deletePrettyWordAction(word.id);

      if ("error" in result) {
        setError(result.error);
        setTimeout(() => setError(""), 2500);
        return;
      }

      router.refresh();
    });
  };

  const submitEdit = (values: { content: string; author: string; category: string }) => {
    setError("");
    startTransition(async () => {
      const result = await updatePrettyWordAction(word.id, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="relative">
      {hasTape ? <Tape className="h-3.5 w-14" /> : null}
      <div
        className={cn(
          "relative flex h-full flex-col rounded-2xl border p-4 shadow-[0_4px_14px_rgba(120,100,140,0.05)] transition hover:-translate-y-0.5",
          variant.card,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <Quote className={cn("h-3.5 w-3.5 shrink-0 rotate-180", variant.accent)} aria-hidden />
          <details className="relative">
            <summary
              className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-[#b0a29d] transition hover:bg-white/70 hover:text-[#564d4d] [&::-webkit-details-marker]:hidden"
              aria-label="문장 관리 메뉴"
            >
              <Ellipsis className="h-4 w-4" aria-hidden />
            </summary>
            <div className="absolute right-0 top-9 z-10 w-28 overflow-hidden rounded-xl border border-[#ece0db] bg-white shadow-lg">
              <button
                type="button"
                onClick={(event) => {
                  (event.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                  setError("");
                  setEditing(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#564d4d] hover:bg-[#faf6f3]"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> 수정
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#8f625f] hover:bg-[#fdf4f1]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> 삭제
              </button>
            </div>
          </details>
        </div>

        <p className="mt-1 flex-1 whitespace-pre-line font-display text-[19px] leading-8 text-[#3d3542]">
          {word.content}
        </p>

        {word.author ? (
          <div className="mt-2 text-xs text-[#8a7b8f]">— {word.author}</div>
        ) : null}

        {doodleKind ? (
          <Doodle kind={doodleKind} className={cn("absolute bottom-3 right-11 h-4 w-4", variant.accent)} />
        ) : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-[#a89a95]">
            <span>{formatKoreanDate(word.created_at.slice(0, 10))}</span>
            {word.category ? (
              <span className="rounded-full bg-white/70 px-1.5 py-0.5">
                {prettyWordCategoryLabels[word.category as PrettyWordCategory] ?? word.category}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기"}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-white/70"
          >
            <Heart
              className={cn("h-4 w-4", favorite ? "fill-[#e79fb4] text-[#d97b9a]" : "text-[#c4b3ae]")}
              aria-hidden
            />
          </button>
        </div>

        {error ? <div className="mt-2 text-xs text-[#a2665f]">{error}</div> : null}
      </div>

      {editing ? (
        <WordFormDialog
          title="문장 고치기"
          initial={{
            content: word.content,
            author: word.author ?? "",
            category: word.category ?? "",
          }}
          isPending={isPending}
          error={error}
          onCancel={() => setEditing(false)}
          onSubmit={submitEdit}
        />
      ) : null}
    </div>
  );
}
