"use client";

import { GraduationCap } from "lucide-react";
import { useState, useTransition } from "react";

import { setExamPeriodAction } from "@/app/groups/actions";

// 그룹 상세 우측 상단의 시험 기간 ON/OFF toggle.
// 즉시 toggle(확인 dialog 없음), pending 중 재클릭 방지, Teacher가 직접 해제할 때까지 유지.
// 상태 변경뿐 — Todo/시험 플래너/일정은 만들지 않는다.
export function ExamPeriodToggle({ groupId, isOn }: { groupId: string; isOn: boolean }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    if (isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await setExamPeriodAction(groupId, !isOn);
      if (result && "error" in result) {
        setError(result.error ?? "시험 기간 상태를 저장하지 못했어요.");
      }
      // 성공 시 revalidatePath가 서버 상태를 다시 내려준다 (낙관적 로컬 상태 불필요)
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={isOn}
        aria-label={isOn ? "시험 기간 끄기" : "시험 기간 켜기"}
        className={
          isOn
            ? "flex min-h-10 items-center gap-1.5 rounded-2xl border border-[#e8c9b0] bg-[#fdf1e6] px-3.5 py-2 text-sm font-semibold text-[#a2643c] transition hover:bg-[#fbe8d8] disabled:opacity-60"
            : "flex min-h-10 items-center gap-1.5 rounded-2xl border border-[#e6e6ea] bg-white px-3.5 py-2 text-sm font-medium text-[#6b6b74] transition hover:bg-[#f4f4f6] disabled:opacity-60"
        }
      >
        <GraduationCap className="h-4 w-4" aria-hidden />
        {isPending ? "저장 중..." : isOn ? "✓ 시험 기간 ON" : "시험 기간 OFF"}
      </button>
      {error ? <span className="text-xs text-[#a26660]">{error}</span> : null}
    </div>
  );
}
