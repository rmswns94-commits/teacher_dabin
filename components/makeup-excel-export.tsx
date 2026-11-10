"use client";

import { ExcelExportMenu } from "@/components/excel-export-menu";
import { monthLabel } from "@/lib/calendar";

// 완료된 보충 수업을 기존 양식("보충 수업.xlsx") Excel로 내보낸다.
// - 완료 기록 전체 (기존 동작)
// - 월별: 그 달(KST)에 실제로 보충한 완료 기록만 — 완료 기록이 있는 달만 선택지로 보여준다
// 파일 생성은 서버(/makeups/export)가 담당 — completed 상태만 포함된다 (read-only).
export function MakeupExcelButton({
  hasCompleted,
  completedMonths,
}: {
  hasCompleted: boolean;
  // 완료 기록이 있는 달 "YYYY-MM" (최근 달 먼저)
  completedMonths: string[];
}) {
  return (
    <ExcelExportMenu
      failMessage="보충 수업 엑셀을 만들지 못했어요. 다시 시도해주세요."
      options={[
        {
          key: "all",
          label: "완료 기록 전체",
          description: hasCompleted ? "지금까지 완료한 보충 전부" : "내보낼 완료된 보충 수업이 없어요.",
          href: "/makeups/export",
          fallbackFilename: "makeups.xlsx",
          disabled: !hasCompleted,
        },
        ...completedMonths.map((month) => ({
          key: month,
          label: `${monthLabel(month)} 한 달`,
          description: "그 달에 완료한 보충만 · 양면 인쇄용",
          href: `/makeups/export?month=${month}`,
          fallbackFilename: `makeups-${month}.xlsx`,
        })),
      ]}
    />
  );
}
