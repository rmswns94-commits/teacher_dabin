import { cn } from "@/lib/utils";

// 시험 기간인 수업 그룹 이름 옆의 "(시험)" 표시 — 표시 전용이라 DB의 group.name은 그대로다.
// 판단 기준은 class_groups.is_exam_period 하나 (시험 일정/플래너 등록 여부와 무관).
// 사이드바 그룹 트리와 대시보드 수업 카드가 이 컴포넌트 하나를 공유한다 (조건 중복 금지).
// 색만이 아니라 실제 텍스트로 상태를 표시하고, shrink-0이라 긴 반 이름이 잘려도 살아남는다.
export function ExamPeriodMark({
  show,
  className,
}: {
  show: boolean | null | undefined;
  className?: string;
}) {
  if (!show) {
    return null;
  }

  return (
    <span className={cn("shrink-0 text-[11px] font-semibold text-[#6d5aa8]", className)}>
      (시험)
    </span>
  );
}
