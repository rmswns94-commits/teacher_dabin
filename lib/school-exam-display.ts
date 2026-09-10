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
// 시험 준비 진행률 % — Planner completed 개수 기준 (목록 카드/상세 플래너가 같은 공식 공유).
// 계획 0개면 0 (NaN/Infinity 금지). 준비 전/중/완료 같은 상태 단계는 더 이상 표시하지 않는다.
export function planProgressPercent(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

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

// Daily Log 시험 대비 미리보기용: 학교 하나의 "보여줄 시험" 선택.
// - school_name 정확 일치만 (substring/fuzzy 금지 — Student.school과 같은 텍스트 도메인)
// - 진행 중/다가오는 시험만 (end_date >= today) — 과거 시험을 임의로 선택하지 않는다
// - 같은 학교에 여러 시험이면 Group 학년과 일치하는 시험 우선, 그다음 시작일이 가까운 순
export function resolveExamForSchool<
  T extends { school_name: string; grade: string; event: { start_date: string; end_date: string } | null },
>(exams: T[], school: string, groupGrade: string | null | undefined, today: string): T | null {
  const candidates = exams.filter(
    (exam) => exam.event && exam.school_name === school && exam.event.end_date >= today,
  );

  candidates.sort((a, b) => {
    const gradeRankA = a.grade === groupGrade ? 0 : 1;
    const gradeRankB = b.grade === groupGrade ? 0 : 1;
    return gradeRankA - gradeRankB || a.event!.start_date.localeCompare(b.event!.start_date);
  });

  return candidates[0] ?? null;
}

export function formatExamPeriod(startDate: string, endDate: string) {
  return endDate > startDate
    ? `${formatKoreanDate(startDate, true)} ~ ${formatKoreanDate(endDate)}`
    : formatKoreanDate(startDate, true);
}
