"use client";

import { GraduationCap } from "lucide-react";
import { useState, useTransition } from "react";

import { setExamPeriodAction, startExamPeriodAction } from "@/app/groups/actions";
import { SchoolSelectDialog } from "@/components/exam-target-schools";
import { Button } from "@/components/ui/button";

// 그룹 상세 우측 상단의 시험 기간 ON/OFF toggle.
// OFF → ON: 즉시 켜지 않고 "이번 시험 대상 학교" 선택 다이얼로그를 먼저 연다 —
//   [시험 대비 시작]을 눌러야 대상 학교 저장 + ON이 한 번의 UPDATE로 함께 적용된다(취소 = 무변화).
// ON → OFF: 기존 "시험이 잘 끝나셨나요?" 확인 유지. 끄는 동작은 is_exam_period만 false —
//   시험 대상 학교/시험 대비용 교재/일지 등 어떤 데이터도 지우지 않는다 (재활성화 때 prefill).
export function ExamPeriodToggle({
  groupId,
  isOn,
  schools,
  targetSchools,
}: {
  groupId: string;
  isOn: boolean;
  // 현재 그룹 학생들의 학교 (page가 이미 조회한 멤버에서 유도 — 추가 쿼리 없음)
  schools: string[];
  // 저장된 시험 대상 학교 (null = 아직 설정 안 함)
  targetSchools: string[] | null;
}) {
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 시작 다이얼로그 prefill: 저장된 선택이 있으면 그대로(이번 시험 기준으로 확인만),
  // 없고 학교가 정확히 1개면 그 학교를 기본 체크 (저장은 [시험 대비 시작]을 눌러야).
  const staleTargets = (targetSchools ?? []).filter((name) => !schools.includes(name));
  const startInitial =
    targetSchools && targetSchools.length > 0
      ? targetSchools
      : schools.length === 1
        ? [schools[0]]
        : [];

  const startExam = (selected: string[]) => {
    if (isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await startExamPeriodAction(groupId, selected);
      if (result && "error" in result) {
        setError(result.error ?? "시험 대비를 시작하지 못했어요.");
        return; // 실패 시 OFF 그대로 — 화면이 켜진 척하지 않는다
      }
      setStartOpen(false);
    });
  };

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
    // OFF → ON: 바로 켜지 않고 이번 시험 대상 학교부터 고른다 (취소하면 아무 변화 없음)
    setError("");
    setStartOpen(true);
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
      {error && !confirmOpen && !startOpen ? (
        <span className="text-sm text-[#a26660]">{error}</span>
      ) : null}

      {startOpen ? (
        <SchoolSelectDialog
          title="시험 대비를 시작할까요?"
          helper="이번 시험을 준비하는 학교를 선택해주세요."
          confirmLabel="시험 대비 시작"
          schools={schools}
          staleTargets={staleTargets}
          initialSelected={startInitial}
          pending={isPending}
          error={error}
          onConfirm={startExam}
          onClose={() => {
            if (!isPending) {
              setStartOpen(false);
              setError("");
            }
          }}
        />
      ) : null}

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
