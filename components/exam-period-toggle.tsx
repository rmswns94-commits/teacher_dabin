"use client";

import { GraduationCap } from "lucide-react";
import { useState, useTransition } from "react";

import { setExamPeriodAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";

// 그룹 상세 우측 상단의 시험 기간 ON/OFF toggle.
// OFF로 되돌릴 때만 "시험이 잘 끝나셨나요?" 확인을 받는다 (ON은 즉시).
// 확인 전에는 상태를 바꾸지 않으므로 취소해도 서버/화면 어디에도 변화가 없다.
// 끄는 동작은 is_exam_period만 false로 바꾼다 — 시험 대비용 교재/일반 교재/일지 등
// 어떤 데이터도 지우지 않는다 (OFF는 삭제가 아니라 모드 종료).
export function ExamPeriodToggle({ groupId, isOn }: { groupId: string; isOn: boolean }) {
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const applyExamPeriod = (next: boolean) => {
    if (isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await setExamPeriodAction(groupId, next);
      if (result && "error" in result) {
        setError(result.error ?? "시험 기간 상태를 저장하지 못했어요.");
        return; // 실패하면 화면 상태도 그대로 (서버 상태와 어긋나지 않게)
      }
      setConfirmOpen(false);
      // 성공 시 revalidatePath가 서버 상태를 다시 내려준다 (낙관적 로컬 상태 불필요)
    });
  };

  const onToggleClick = () => {
    if (isPending) {
      return;
    }
    if (isOn) {
      setError("");
      setConfirmOpen(true); // ON → OFF: 확인 후에만 실제로 끈다
      return;
    }
    applyExamPeriod(true);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onToggleClick}
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
        {isPending && !confirmOpen ? "저장 중..." : isOn ? "✓ 시험 기간 ON" : "시험 기간 OFF"}
      </button>
      {error && !confirmOpen ? <span className="text-sm text-[#a26660]">{error}</span> : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="시험 기간 종료 확인"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              setConfirmOpen(false);
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 text-left shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="text-lg font-semibold text-[#2a2323]">시험이 잘 끝나셨나요?</div>
            <p className="mt-3 text-sm leading-5 text-[#655d5d]">
              시험 기간을 끄면 수업일지가 다시 교재 기준으로 돌아가요. 등록한 시험 대비용 교재는
              지워지지 않고, 다시 켜면 그대로 사용할 수 있어요.
            </p>

            {error ? (
              <div className="mt-3 rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#7f5d57]">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setConfirmOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => applyExamPeriod(false)}
              >
                {isPending ? "처리 중..." : "예"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
