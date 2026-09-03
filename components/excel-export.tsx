"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// 선택한 날짜의 수업 기록을 기존 교사일지 양식(.xlsx)으로 내보낸다.
// 파일 생성은 서버(/daily-logs/export)가 담당 — 실패 시 사용자용 메시지를 그대로 보여준다.
export function ExcelExportButton({ date }: { date: string | null }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    if (!date || isExporting) {
      return;
    }

    setError("");
    setIsExporting(true);

    try {
      const response = await fetch(`/daily-logs/export?date=${date}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "엑셀을 만들지 못했어요. 다시 시도해주세요.");
        return;
      }

      // Content-Disposition의 filename* (RFC 5987)에서 한글 파일명 복원
      const disposition = response.headers.get("content-disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : "teacher-log.xlsx";

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
      setError("엑셀을 만들지 못했어요. 네트워크를 확인해주세요.");
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
        disabled={!date || isExporting}
        onClick={download}
      >
        <FileSpreadsheet className="h-4 w-4" />
        {isExporting ? "엑셀을 만들고 있어요..." : "엑셀 내보내기"}
      </Button>
      {error ? <span className="max-w-64 text-right text-xs text-[#a26660]">{error}</span> : null}
    </div>
  );
}
