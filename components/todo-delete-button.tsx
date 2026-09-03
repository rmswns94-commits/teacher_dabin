"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deletePreparationItemAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";

// 오늘 할 일 페이지의 할 일 삭제 (완료가 primary, 삭제는 secondary).
// 삭제는 id 기준 실제 데이터 mutation — Dashboard/그룹 상세 등 같은 row를 보는
// 모든 화면에서 함께 사라진다 (수업 종료로 Dashboard에서 숨는 것과는 다른 동작).
export function TodoDeleteButton({
  groupId,
  itemId,
  text,
}: {
  groupId: string;
  itemId: string;
  text: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deletePreparationItemAction(groupId, itemId);
        setConfirmOpen(false);
      } catch {
        // 실패 시 항목은 그대로 유지된다 (revalidate가 일어나지 않음)
        alert("할 일을 삭제하지 못했어요. 다시 시도해주세요.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={`${text} 삭제`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#b5a29e] transition hover:bg-[#fdf4f1] hover:text-[#8f625f]"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="할 일 삭제 확인"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-xs rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="font-semibold text-[#2a2323]">이 할 일을 삭제할까요?</div>
            <p className="mt-2 break-all text-sm leading-6 text-[#655d5d]">{text}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={handleDelete}
                className="bg-[#a1574f] hover:bg-[#8f4c45]"
              >
                {isPending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
