"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Plus } from "lucide-react";

import { createTodoAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import { groupIconOf } from "@/lib/group-icons";

// 오늘 할 일 페이지의 [+ 할 일 추가] — 기존 그룹 준비(manual preparation)와
// 같은 실제 row를 만들 뿐이라, Dashboard/그룹 상세에도 같은 항목이 그대로 연동된다.
export function TodoCreateDialog({
  groups,
  defaultDate,
}: {
  groups: { id: string; name: string; icon: string | null }[];
  defaultDate: string; // Asia/Seoul 오늘 (서버 계산)
}) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isPending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setError("");
  };

  const submit = () => {
    setError("");
    if (!groupId) {
      setError("수업 그룹을 선택해주세요.");
      return;
    }
    if (!text.trim()) {
      setError("할 일 내용을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const result = await createTodoAction({ groupId, text, dueDate });
      if ("error" in result) {
        // 실패: dialog와 입력값 유지
        setError(result.error ?? "할 일을 추가하지 못했어요.");
        return;
      }
      setOpen(false);
      setText("");
      setDueDate(defaultDate);
      setError("");
      setToast("할 일을 추가했어요.");
      setTimeout(() => setToast(""), 2500);
    });
  };

  return (
    <>
      <Button type="button" className="min-h-11 gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> 할 일 추가
      </Button>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[75] -translate-x-1/2 rounded-2xl bg-[#2b2323]/90 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="할 일 추가"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return; // 한글 조합 중 Escape/키 확정은 dialog 동작으로 처리하지 않는다
            }
            if (event.key === "Escape") {
              close();
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="font-display text-lg font-semibold text-[#2a2323]">할 일 추가</div>
            <p className="mt-1 text-sm text-[#8a7b77]">수업 그룹과 할 일을 선택해주세요.</p>

            <div className="mt-4 space-y-3.5">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">수업 그룹</span>
                <select
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  className="w-full min-w-0 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-base outline-none focus:border-[#c9b9e8] md:text-sm"
                >
                  <option value="">그룹 선택</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {groupIconOf(group.icon)} {group.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-[#4d3a3a]">할 일</span>
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={100}
                  placeholder="프린트 20장 출력"
                  className="w-full min-w-0 rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-base outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996] md:text-sm"
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                  <CalendarDays className="h-3.5 w-3.5 text-[#6d5aa8]" aria-hidden /> 날짜
                </span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-base outline-none focus:border-[#c9b9e8] md:text-sm"
                />
                <span className="mt-1 block text-[11px] text-[#a79996]">
                  오늘이 기본이에요. 미래 날짜로 등록하면 그 날짜부터 목록에 나타나요.
                </span>
              </label>

              {error ? (
                <p className="rounded-2xl bg-[#fdf1f0] px-3 py-2.5 text-sm text-[#a05252]">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={close}>
                  취소
                </Button>
                <Button type="button" disabled={isPending} onClick={submit}>
                  {isPending ? "등록 중..." : "할 일 등록"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
