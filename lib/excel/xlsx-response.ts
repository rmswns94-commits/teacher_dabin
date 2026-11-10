import { NextResponse } from "next/server";

// Excel 내보내기 route 공용 응답 — 파일은 서버에 저장하지 않고 즉시 다운로드로만 반환한다.

export const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function excelErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// 한글 파일명은 filename* (RFC 5987), ASCII fallback은 filename
export function xlsxDownloadResponse(buffer: Buffer, filename: string, asciiFallback: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

// 월간 파일명 — 기존 "출석부_2026-11.xlsx" 관례: "<이름>_YYYY-MM.xlsx"
export function monthlyExportFilename(title: string, month: string) {
  return `${title}_${month}.xlsx`;
}
