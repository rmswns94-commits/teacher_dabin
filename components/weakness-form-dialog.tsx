"use client";

import { useState } from "react";

import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { weaknessCategoryLabels, weaknessCategoryValues } from "@/lib/validation/weakness";
import { formatKoreanDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type WeaknessFormValues = {
  category: string;
  title: string;
  note: string;
  reviewDueDate: string;
};

// 분류 chip — 약점이 "문제 학생" 낙인처럼 보이지 않게 soft peach/lavender/cream 계열만 사용.
const categoryChipActiveClass: Record<string, string> = {
  grammar: "border-[#d3cbee] bg-[#f0ecfb] text-[#54479c]",
  vocabulary: "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]",
  reading: "border-[#c9dcec] bg-[#eef6fb] text-[#3c6478]",
  listening: "border-[#cbe0d3] bg-[#e9f6ef] text-[#2f6d54]",
  writing: "border-[#f0d3dd] bg-[#fbeef3] text-[#a05a7c]",
  pronunciation: "border-[#ddd0ec] bg-[#f6effa] text-[#7a5a92]",
  homework: "border-[#e8ddd3] bg-[#faf5ee] text-[#8a6f56]",
  other: "border-[#dcdce2] bg-[#f4f4f6] text-[#6b6b74]",
};

// 학생 상세와 수업일지가 함께 쓰는 공용 약점 등록/수정 폼.
// 저장 자체는 부모가 담당한다 (등록 context — 학생/그룹/일지 연결 — 는 부모가 알고 있음).
export function WeaknessFormDialog({
  heading,
  studentName,
  defaultReviewDueDate = "",
  dueDateHint,
  initial,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  heading: string;
  studentName: string;
  // 신규 등록일 때 제안하는 날짜 (반의 다음 실제 수업일 — 계산 불가하면 빈 값으로 직접 선택)
  defaultReviewDueDate?: string;
  dueDateHint?: string;
  initial?: WeaknessFormValues;
  isPending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (values: WeaknessFormValues) => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [reviewDueDate, setReviewDueDate] = useState(initial?.reviewDueDate ?? defaultReviewDueDate);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isDirty =
    category !== (initial?.category ?? "") ||
    title !== (initial?.title ?? "") ||
    note !== (initial?.note ?? "") ||
    reviewDueDate !== (initial?.reviewDueDate ?? defaultReviewDueDate);

  useBeforeUnloadWarning(isDirty);

  const requestClose = () => {
    if (isPending) {
      return;
    }

    if (isDirty) {
      setConfirmOpen(true);
    } else {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) {
          return;
        }
        if (event.key === "Escape" && !confirmOpen) {
          requestClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDirty && !isPending) {
          onCancel();
        }
      }}
    >
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="font-display text-lg font-semibold text-[#2a2323]">{heading}</div>
        <p className="mt-1 text-xs text-[#8a7b77]">
          {studentName} 학생이 자주 헷갈리는 부분을 적어두고, 다음에 다시 확인해요.
        </p>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">분류</span>
          <div className="grid grid-cols-4 gap-1.5">
            {weaknessCategoryValues.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={cn(
                  "min-h-[38px] rounded-xl border px-2 py-1.5 text-xs font-medium transition",
                  category === value
                    ? categoryChipActiveClass[value]
                    : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                )}
              >
                {weaknessCategoryLabels[value]}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">내용</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="3인칭 단수 s를 자주 빠뜨려요"
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#e3b9c9]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">메모 (선택)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="He play → He plays 같은 오류가 반복돼요."
            className="w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#e3b9c9]"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">다시 확인할 날짜 (선택)</span>
          <input
            type="date"
            value={reviewDueDate}
            onChange={(event) => setReviewDueDate(event.target.value)}
            className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-white px-3 py-2.5 text-sm outline-none"
          />
          {dueDateHint && reviewDueDate && reviewDueDate === defaultReviewDueDate ? (
            <span className="mt-1 block text-[11px] text-[#8a7b77]">
              {dueDateHint} ({formatKoreanDate(reviewDueDate, true)}) — 바꿀 수 있어요.
            </span>
          ) : null}
        </label>

        {error ? (
          <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={requestClose}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !category || !title.trim()}
            onClick={() => onSubmit({ category, title, note, reviewDueDate })}
          >
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>

      <ConfirmDiscardDialog
        open={confirmOpen}
        onKeepEditing={() => setConfirmOpen(false)}
        onDiscard={onCancel}
      />
    </div>
  );
}
