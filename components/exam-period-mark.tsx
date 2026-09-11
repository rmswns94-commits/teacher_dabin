import { cn } from "@/lib/utils";

// 시험 기간인 수업 그룹 이름 옆의 시험 표시 — 표시 전용이라 DB의 group.name은 그대로다.
// 판단 기준은 class_groups.is_exam_period 하나 (시험 일정/플래너/시험 교재 등록 여부와 무관).
// 사이드바 그룹 트리·대시보드 수업 카드·수업 그룹 카드가 이 컴포넌트 하나를 공유한다
// (보여줄지 말지를 정하는 조건이 여기 한 곳뿐이라 화면마다 판정이 갈릴 수 없다).
// 색만이 아니라 실제 텍스트로 상태를 표시하고, shrink-0이라 긴 반 이름이 잘려도 살아남는다.
//
// variant는 생김새만 다르다 — "text"는 이름 뒤에 덧붙는 (시험), "badge"는 학년 칩 옆에 놓이는
// 알약 badge. 수업 그룹 카드는 학년 badge와 나란히 놓이므로 badge 쪽이 자연스럽다.
export function ExamPeriodMark({
  show,
  variant = "text",
  className,
}: {
  show: boolean | null | undefined;
  variant?: "text" | "badge";
  className?: string;
}) {
  if (!show) {
    return null;
  }

  if (variant === "badge") {
    return (
      <span
        className={cn(
          "shrink-0 rounded-full bg-[#efe8fb] px-2 py-0.5 text-xs font-semibold text-[#5d4ba5]",
          className,
        )}
      >
        시험
      </span>
    );
  }

  return (
    <span className={cn("shrink-0 text-sm font-semibold text-[#6d5aa8]", className)}>
      (시험)
    </span>
  );
}
