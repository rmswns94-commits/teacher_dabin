"use client";

import { useState, useTransition } from "react";
import { BookMarked, Check, Plus, Trash2, X } from "lucide-react";

import {
  addExamTextbookAction,
  removeExamTextbookAction,
  renameExamTextbookAction,
} from "@/app/groups/actions";
import type { ExamTextbook } from "@/lib/supabase/types";

// 시험 대비용 교재 관리 (시험 기간 ON일 때만 노출).
// 한 권씩 등록/이름 수정/삭제하며 각 항목은 stable id로 다룬다 (index 식별 금지).
// 일반 교재(수업 그룹 수정 폼의 "교재")와는 저장 위치가 분리돼 서로 건드리지 않고,
// 시험 기간을 OFF로 되돌려도 이 목록은 지워지지 않는다 (UI만 숨김).
export function ExamTextbooksEditor({
  groupId,
  books,
}: {
  groupId: string;
  books: ExamTextbook[];
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const inputClass =
    "min-h-[40px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]";

  const submitAdd = () => {
    const name = newName.trim();
    if (!name || isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await addExamTextbookAction(groupId, name);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setNewName("");
      setAdding(false);
    });
  };

  const submitRename = (bookId: string) => {
    const name = editingName.trim();
    if (!name || isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await renameExamTextbookAction(groupId, bookId, name);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEditingId(null);
    });
  };

  const submitRemove = (book: ExamTextbook) => {
    if (!window.confirm(`'${book.name}' 교재를 시험 대비용 목록에서 지울까요?`)) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await removeExamTextbookAction(groupId, book.id);
      if ("error" in result) {
        setError(result.error);
      }
    });
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#a2643c]">
        <BookMarked className="h-3.5 w-3.5" aria-hidden /> 시험 대비용 교재
      </div>

      {books.length === 0 ? (
        <p className="mt-2 text-sm text-[#8a7b77]">
          아직 등록된 시험 대비용 교재가 없어요. 등록하면 수업일지 엑셀의 교재 칸에 쓰여요.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {books.map((book) => (
            <li key={book.id}>
              {editingId === book.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    maxLength={100}
                    aria-label={`${book.name} 이름 수정`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => submitRename(book.id)}
                    disabled={isPending || !editingName.trim()}
                    aria-label="교재 이름 저장"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#3d7f64] transition hover:bg-[#eaf5ef] disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="이름 수정 취소"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8a7b77] transition hover:bg-[#f4f4f6]"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-xl bg-[#fdf6ec] px-3 py-2">
                  <span aria-hidden className="shrink-0 text-sm">
                    📘
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm text-[#5c4a2e]">{book.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(book.id);
                      setEditingName(book.name);
                      setError("");
                    }}
                    className="min-h-[40px] shrink-0 px-2 text-xs text-[#5c4ca8] transition hover:underline"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => submitRemove(book)}
                    disabled={isPending}
                    aria-label={`${book.name} 삭제`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#a79996] transition hover:bg-[#fdf4f1] hover:text-[#8f625f] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              // IME 조합 중 Enter는 한글 확정이라 등록으로 처리하지 않는다
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitAdd();
              }
            }}
            maxLength={100}
            autoFocus
            placeholder="백발백중 중2"
            aria-label="시험 대비용 교재 이름"
            className={inputClass}
          />
          <button
            type="button"
            onClick={submitAdd}
            disabled={isPending || !newName.trim()}
            className="min-h-[40px] shrink-0 rounded-xl bg-[#2b2b31] px-3 text-xs font-medium text-white transition hover:bg-[#3a3a42] disabled:opacity-50"
          >
            등록
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
              setError("");
            }}
            className="min-h-[40px] shrink-0 px-2 text-xs text-[#8a7b77] transition hover:underline"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setError("");
          }}
          className="mt-2 flex min-h-[40px] items-center gap-1.5 rounded-xl border border-dashed border-[#e0c9b4] px-3 text-sm text-[#a2643c] transition hover:bg-[#fdf1e6]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> 교재 등록
        </button>
      )}

      {error ? <p className="mt-1.5 text-xs text-[#a2665f]">{error}</p> : null}
    </div>
  );
}
