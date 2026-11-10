"use client";

import { ChevronDown, FileSpreadsheet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Excel 내보내기 공용 메뉴 — [엑셀 내보내기 ▾] 아래 "하루 / 한 달" 같은 선택지.
// 파일 생성은 서버 export route가 담당하고, 여기서는 받아서 저장만 한다 (서버 저장 없음).
// 생성 중에는 메뉴 전체가 잠겨 같은 파일을 두 번 만들지 않는다 (실패해도 버튼은 복구).

export type ExcelExportOption = {
  key: string;
  label: string;
  description?: string;
  href: string;
  fallbackFilename: string;
  disabled?: boolean;
};

const MENU_WIDTH = 256; // w-64

// route 응답(xlsx)을 파일로 저장 — 실패하면 서버가 준 사용자용 메시지를 돌려준다
async function downloadExcelFile(href: string, fallbackFilename: string, failMessage: string) {
  try {
    const response = await fetch(href);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return body?.error ?? failMessage;
    }

    // Content-Disposition의 filename* (RFC 5987)에서 한글 파일명 복원
    const disposition = response.headers.get("content-disposition") ?? "";
    const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
    const filename = encoded ? decodeURIComponent(encoded) : fallbackFilename;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return null;
  } catch {
    return "엑셀을 만들지 못했어요. 네트워크를 확인해주세요.";
  }
}

export function ExcelExportMenu({
  options,
  label = "엑셀 내보내기",
  failMessage = "엑셀을 만들지 못했어요. 다시 시도해주세요.",
}: {
  options: ExcelExportOption[];
  label?: string;
  failMessage?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // state 반영 전 연속 클릭까지 막는 동기 guard
  const busyRef = useRef(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  // 좁은 화면에서 버튼이 왼쪽으로 줄바꿈되면 메뉴를 왼쪽 기준으로 펼친다 (화면 밖으로 나가지 않게)
  const [alignLeft, setAlignLeft] = useState(false);

  // 바깥 클릭 / Escape로 닫기
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: PointerEvent | KeyboardEvent) => {
      const details = detailsRef.current;
      if (!details) {
        return;
      }
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const run = async (option: ExcelExportOption) => {
    if (busyRef.current || option.disabled) {
      return;
    }
    busyRef.current = true;
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
    setError("");
    setBusyKey(option.key);

    const message = await downloadExcelFile(option.href, option.fallbackFilename, failMessage);
    if (message) {
      setError(message);
    }

    busyRef.current = false;
    setBusyKey(null);
  };

  const busy = busyKey !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <details
        ref={detailsRef}
        className="relative"
        onToggle={(event) => {
          const details = event.currentTarget;
          if (details.open) {
            const rect = details.getBoundingClientRect();
            setAlignLeft(rect.right - MENU_WIDTH < 16);
          }
          setOpen(details.open);
        }}
      >
        <summary
          aria-disabled={busy}
          onClick={(event) => {
            // 만드는 중에는 메뉴를 다시 열지 않는다 (double-submit 방지)
            if (busy) {
              event.preventDefault();
            }
          }}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          {busy ? "엑셀을 만들고 있어요..." : label}
          {busy ? null : <ChevronDown className="h-4 w-4" aria-hidden />}
        </summary>
        <div
          role="menu"
          className={cn(
            "absolute top-full z-30 mt-1 max-h-[min(70vh,24rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-[#e4e4ea] bg-white py-1 shadow-lg",
            alignLeft ? "left-0" : "right-0",
          )}
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              disabled={option.disabled || busy}
              onClick={() => run(option)}
              className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left transition hover:bg-[#f4f4f6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-sm font-medium text-[#33333b]">{option.label}</span>
              {option.description ? (
                <span className="text-xs text-[#8a8a93]">{option.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      </details>
      {error ? <span className="max-w-64 text-right text-sm text-[#a26660]">{error}</span> : null}
    </div>
  );
}
