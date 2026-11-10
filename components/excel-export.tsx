"use client";

import { ExcelExportMenu } from "@/components/excel-export-menu";
import { monthLabel } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";

// 수업 기록을 기존 교사일지 양식(.xlsx)으로 내보낸다.
// - 하루: 선택한 날짜 (기존 일 단위 — 양식 1장)
// - 한 달: 보고 있는 달(KST 달력 월) — 기록이 있는 날짜마다 양식 시트 1개(= 1장), 날짜순으로 한 파일에
// 파일 생성은 서버(/daily-logs/export)가 담당 — 실패 시 사용자용 메시지를 그대로 보여준다.
export function ExcelExportButton({ date, month }: { date: string | null; month: string }) {
  return (
    <ExcelExportMenu
      options={[
        {
          key: "day",
          label: date ? `${formatKoreanDate(date)} 하루` : "하루 (날짜를 먼저 선택해주세요)",
          description: "선택한 날짜의 교사일지 1장",
          href: `/daily-logs/export?date=${date ?? ""}`,
          fallbackFilename: "teacher-log.xlsx",
          disabled: !date,
        },
        {
          key: "month",
          label: `${monthLabel(month)} 한 달`,
          description: "날짜마다 시트 1장 · 인쇄할 때 '통합 문서 전체' 선택",
          href: `/daily-logs/export?month=${month}`,
          fallbackFilename: `teacher-log-${month}.xlsx`,
        },
      ]}
    />
  );
}
