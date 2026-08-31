"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";

import { GroupCreateForm } from "@/components/group-create-form";
import { ConfirmDiscardDialog, useBeforeUnloadWarning } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";

// 그룹 등록은 기존 GroupCreateForm(수업 시간/교재 포함)을 다이얼로그로 감싼다.
// 등록 성공 시 서버 액션이 새 그룹 상세로 redirect하므로 다이얼로그는 자연히 닫힌다.
export function GroupCreateDialog({ label = "수업 그룹 등록" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  // 다시 열 때 이전 임시 입력이 남지 않도록 key로 폼을 새로 mount한다.
  const [sessionKey, setSessionKey] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useBeforeUnloadWarning(open && isDirty);

  const openDialog = () => {
    setSessionKey((key) => key + 1);
    setIsDirty(false);
    setConfirmOpen(false);
    setOpen(true);
  };

  // 취소/ESC: 작성 중이면 확인을 거친다.
  const requestClose = () => {
    if (isDirty) {
      setConfirmOpen(true);
    } else {
      setOpen(false);
    }
  };

  const discard = () => {
    setConfirmOpen(false);
    setOpen(false);
  };

  return (
    <>
      <Button type="button" className="gap-2" onClick={openDialog}>
        <FolderPlus className="h-4 w-4" /> {label}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label="수업 그룹 등록"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !confirmOpen) {
              requestClose();
            }
          }}
          onClick={(event) => {
            // 바깥(backdrop) 클릭: 작성 중이면 아무 일도 일어나지 않는다.
            if (event.target === event.currentTarget && !isDirty) {
              setOpen(false);
            }
          }}
        >
          <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="mb-4 font-display text-lg font-semibold text-[#2a2323]">수업 그룹 등록</div>
            <GroupCreateForm key={sessionKey} onCancel={requestClose} onDirtyChange={setIsDirty} />
          </div>

          <ConfirmDiscardDialog
            open={confirmOpen}
            onKeepEditing={() => setConfirmOpen(false)}
            onDiscard={discard}
          />
        </div>
      ) : null}
    </>
  );
}
