"use client";

import { FolderPlus } from "lucide-react";
import { useState } from "react";

import { GroupCreateForm } from "@/components/group-create-form";
import { Button } from "@/components/ui/button";

// 그룹 등록은 기존 GroupCreateForm(수업 시간/교재 포함)을 다이얼로그로 감싼다.
// 등록 성공 시 서버 액션이 새 그룹 상세로 redirect하므로 다이얼로그는 자연히 닫힌다.
export function GroupCreateDialog({ label = "수업 그룹 등록" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  // 다시 열 때 이전 임시 입력이 남지 않도록 key로 폼을 새로 mount한다.
  const [sessionKey, setSessionKey] = useState(0);

  const openDialog = () => {
    setSessionKey((key) => key + 1);
    setOpen(true);
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
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="mb-4 font-display text-lg font-semibold text-[#2a2323]">수업 그룹 등록</div>
            <GroupCreateForm key={sessionKey} onCancel={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
