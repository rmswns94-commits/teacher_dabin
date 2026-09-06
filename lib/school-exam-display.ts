import { daysBetween } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/dates";
import type { SchoolExamType } from "@/lib/supabase/types";

// 시험 종류 badge — 색상만으로 구분하지 않는다 (text label 필수, 색은 보조)
export const examTypeBadgeClass: Record<SchoolExamType, string> = {
  midterm: "bg-[#f0ecfb] text-[#54479c]", // soft lavender
  final: "bg-[#fbeef3] text-[#a05a7c]", // dusty pink
  other: "bg-[#f4f4f6] text-[#6b6b74]",
};

export type ExamDdayInfo = { label: string; className: string; ended: boolean };

// D-Day는 시험 시작일 기준 (KST date-only, daysBetween 공통 유틸 재사용).
// 가까워지면(D-7 이하) 살짝만 강조 — 빨간 경고판 금지. 지난 시험은 muted "종료".
export function examDdayInfo(today: string, startDate: string, endDate: string): ExamDdayInfo {
  if (startDate <= today && today <= endDate) {
    return { label: "시험 기간 중", className: "bg-[#fbeef3] text-[#a05a7c]", ended: false };
  }

  const dday = daysBetween(today, startDate);

  if (dday >= 0) {
    return {
      label: dday === 0 ? "D-DAY" : `D-${dday}`,
      className: dday <= 7 ? "bg-[#fdf3e4] text-[#94702f]" : "bg-[#efe8fb] text-[#5d4ba5]",
      ended: false,
    };
  }

  return { label: "종료", className: "bg-[#f4f4f6] text-[#8a8a93]", ended: true };
}

export function formatExamPeriod(startDate: string, endDate: string) {
  return endDate > startDate
    ? `${formatKoreanDate(startDate, true)} ~ ${formatKoreanDate(endDate)}`
    : formatKoreanDate(startDate, true);
}
