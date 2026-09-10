"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// 현재 표시 중인 달의 월간 출석부(.xlsx)를 내보낸다.
// 파일 생성은 서버(/attendance/export)가 담당 — 화면과 같은 데이터 소스를 쓴다.
export function AttendanceExcelButton({ month, hasData }: { month: string; hasData: boolean }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    if (isExporting) {
      return;
    }

    setError("");
    setIsExporting(true);

    try {
      const response = await fetch(`/attendance/export?month=${month}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "출석부를 만들지 못했어요. 다시 시도해주세요.");
        return;
      }

      // Content-Disposition의 filename* (RFC 5987)에서 한글 파일명 복원
      const disposition = response.headers.get("content-disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : "attendance.xlsx";

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
      setError("출석부를 만들지 못했어요. 네트워크를 확인해주세요.");
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
        disabled={!hasData || isExporting}
        onClick={download}
        title={hasData ? undefined : "이 달에는 내보낼 출결 기록이 없어요."}
      >
        <FileSpreadsheet className="h-4 w-4" />
        {isExporting ? "출석부를 만들고 있어요..." : "출석부 엑셀 내보내기"}
      </Button>
      {error ? <span className="max-w-64 text-right text-sm text-[#a26660]">{error}</span> : null}
    </div>
  );
}
