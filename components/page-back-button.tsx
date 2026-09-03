"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { hasInternalHistory } from "@/components/nav-history-tracker";
import { anyRegisteredFormDirty, ConfirmDiscardDialog } from "@/components/unsaved-guard";

// 상세/작성 페이지 공용 뒤로가기.
// 앱 내부에서 들어왔으면 router.back()으로 이전 화면의 검색/필터/선택 상태를 보존하고,
// URL 직접 진입/PWA 직접 실행처럼 내부 history가 없으면 안전한 상위 route로 이동한다.
// 작성 중(dirty)인 폼이 있으면 기존 unsaved 확인을 거친다 (브라우저 native Back은 건드리지 않음).
export function PageBackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const navigate = () => {
    if (hasInternalHistory()) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  const handleClick = () => {
    if (anyRegisteredFormDirty()) {
      setConfirmOpen(true);
      return;
    }
    navigate();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="이전 페이지로 돌아가기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#6b6b74] transition hover:bg-[#f3eefa] hover:text-[#3d3450] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b9e8]"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>

      <ConfirmDiscardDialog
        open={confirmOpen}
        onKeepEditing={() => setConfirmOpen(false)}
        onDiscard={() => {
          setConfirmOpen(false);
          navigate();
        }}
      />
    </>
  );
}
