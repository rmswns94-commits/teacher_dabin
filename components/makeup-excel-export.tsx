"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// 완료된 보충 수업 전체를 기존 양식("보충 수업.xlsx") Excel로 내보낸다.
// 파일 생성은 서버(/makeups/export)가 담당 — completed 상태만 포함된다 (read-only).
export function MakeupExcelButton({ hasCompleted }: { hasCompleted: boolean }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    if (isExporting) {
      return;
    }

    if (!hasCompleted) {
      setError("내보낼 완료된 보충 수업이 없어요.");
      return;
    }

    setError("");
    setIsExporting(true);

    try {
      const response = await fetch("/makeups/export");

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "보충 수업 엑셀을 만들지 못했어요. 다시 시도해주세요.");
        return;
      }

      // Content-Disposition의 filename* (RFC 5987)에서 한글 파일명 복원
      const disposition = response.headers.get("content-disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : "makeups.xlsx";

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("보충 수업 엑셀을 만들지 못했어요. 네트워크를 확인해주세요.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        disabled={isExporting}
        onClick={download}
        title={hasCompleted ? undefined : "내보낼 완료된 보충 수업이 없어요."}
      >
        <FileSpreadsheet className="h-4 w-4" />
        {isExporting ? "엑셀을 만들고 있어요..." : "보충 수업 엑셀 내보내기"}
      </Button>
      {error ? <span className="max-w-64 text-right text-sm text-[#a26660]">{error}</span> : null}
    </div>
  );
}
