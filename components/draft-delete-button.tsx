"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteWritingDraftAction } from "@/app/daily-logs/actions";
import { Button } from "@/components/ui/button";

// "작성 중인 일지" 목록의 [임시저장 삭제] — 특정 draft 하나만 버리는 기능.
// 완료된 수업일지 삭제(DailyLogDeleteButton)와는 별개이며, 서버 action이
// draft 상태를 다시 검증한다. 삭제는 확인 dialog를 거치고 성공 후에만 목록에서 사라진다
// (action의 revalidatePath가 목록을 갱신 — 전체 새로고침 없음).
export function DraftDeleteButton({
  kind,
  deleteId,
  groupName,
  groupIcon,
  dateLabel,
}: {
  kind: "log" | "autosave";
  deleteId: string;
  groupName: string;
  groupIcon: string | null;
  dateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const confirmDelete = () => {
    if (isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await deleteWritingDraftAction({ kind, id: deleteId });

      if ("error" in result) {
        setError(result.error ?? "임시저장을 삭제하지 못했어요. 다시 시도해주세요.");
        return;
      }

      // 성공 — revalidatePath로 목록이 갱신되며 이 카드 자체가 사라진다
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label={`${dateLabel} ${groupName} 임시저장 삭제`}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="flex h-10 shrink-0 items-center gap-1 rounded-xl px-2.5 text-sm font-medium text-[#a26660] transition hover:bg-[#fff5f2] hover:text-[#8a5048]"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> 삭제
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="임시저장 삭제 확인"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              setOpen(false);
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="text-lg font-semibold text-[#2a2323]">
              임시저장된 수업일지를 삭제할까요?
            </div>

            <div className="mt-3 rounded-2xl bg-[#f8f3ef] p-3 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-[#2b2323]">
                {groupIcon ? <span aria-hidden>{groupIcon}</span> : null}
                {groupName}
              </div>
              <div className="mt-0.5 tabular-nums text-[#655d5d]">{dateLabel}</div>
            </div>

            <p className="mt-3 text-sm leading-5 text-[#7f5d57]">
              삭제하면 작성 중이던 내용은 복구할 수 없어요. 완료된 수업일지와 다른 임시저장은
              영향을 받지 않아요.
            </p>

            {error ? (
              <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={confirmDelete}
                className="gap-1.5 bg-[#a2564d] text-white hover:bg-[#8f4a42]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isPending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
