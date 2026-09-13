"use client";

import { Plus, Trash2 } from "lucide-react";
import { selectManualProgressTextbook, type ManualProgressItem } from "@/lib/manual-progress";

export function ManualTextbookProgress({ items, textbooks, canAdd, onChange, purpose = "progress" }: {
  items: ManualProgressItem[];
  textbooks: string[];
  canAdd: boolean;
  onChange: (items: ManualProgressItem[]) => void;
  purpose?: "progress" | "plan";
}) {
  const label = purpose === "plan" ? "계획" : "진도";
  if (!canAdd && items.length === 0) return null;
  const hasAvailable = textbooks.some((name) => !items.some((item) => item.name === name));
  return (
    <div className="min-w-0 space-y-2.5">
      <div className="form-label font-semibold text-[#6652b9]">일반 수업 {label}</div>
      {canAdd ? (
        <button type="button" disabled={!hasAvailable}
          onClick={() => onChange([...items, { id: globalThis.crypto.randomUUID(), name: "", text: "" }])}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#d9c8f0] bg-white text-sm font-medium text-[#6652b9] transition hover:bg-[#faf7ff] disabled:opacity-50">
          <Plus className="h-4 w-4" aria-hidden /> 교재 {label} 추가
        </button>
      ) : null}
      {canAdd && textbooks.length === 0 ? (
        <div className="secondary-text rounded-xl bg-[#f8f3ef] px-3 py-2 text-[#7f6f68]">
          등록된 일반 교재가 없어요. 수업 그룹에서 교재를 등록해주세요.
        </div>
      ) : null}
      {items.map((item) => (
        <div key={item.id} data-progress-id={purpose === "progress" ? item.id : undefined} data-plan-id={purpose === "plan" ? item.id : undefined} className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="form-label flex min-w-0 flex-1 items-center gap-2 text-[#6652b9]">
              <span className="shrink-0">교재</span>
              <select value={item.name} aria-label={`일반 ${label} 교재 선택`}
                onChange={(event) => onChange(selectManualProgressTextbook(items, item.id, event.target.value, textbooks))}
                className="min-h-[36px] w-full min-w-0 rounded-xl border border-[#e2d8f3] bg-[#f8f5fd] px-2.5 py-1.5 text-base outline-none">
                <option value="">교재를 선택해주세요</option>
                {item.name && !textbooks.includes(item.name) ? <option value={item.name}>{item.name} (기존 기록)</option> : null}
                {textbooks.map((name) => (
                  <option key={name} value={name} disabled={items.some((other) => other.id !== item.id && other.name === name)}>{name}</option>
                ))}
              </select>
            </label>
            <button type="button" aria-label={`${item.name || "선택 전 교재"} ${label} 삭제`}
              onClick={() => onChange(items.filter((other) => other.id !== item.id))}
              className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm text-[#a26660]">
              <Trash2 className="h-4 w-4" aria-hidden /> 삭제
            </button>
          </div>
          <textarea value={item.text} rows={3} aria-label={`${item.name || "선택 전 교재"} ${label}`}
            onChange={(event) => onChange(items.map((other) => other.id === item.id ? { ...other, text: event.target.value } : other))}
            className="min-h-[76px] w-full rounded-2xl border border-[#e2d8f3] bg-white px-3 py-2.5 text-base leading-6 outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
            placeholder={"단원 · 페이지 · 문법 등을 입력해주세요.\n여러 줄로 쓸 수 있어요."} />
        </div>
      ))}
    </div>
  );
}
