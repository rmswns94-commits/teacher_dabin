"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteDailyLogAction } from "@/app/daily-logs/actions";
import { Button } from "@/components/ui/button";

// 수업일지 삭제 (Detail에서만 노출 — 목록 카드에는 두지 않는다).
// destructive action이므로 반드시 확인 dialog를 거치고,
// DB 삭제 성공을 확인한 뒤에만 UI에서 제거한다 (optimistic 아님).
export function DailyLogDeleteButton({
  dailyLogId,
  groupName,
  dateLabel,
  timeRange,
}: {
  dailyLogId: string;
  groupName: string;
  dateLabel: string;
  timeRange: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const confirmDelete = () => {
    setError("");
    startTransition(async () => {
      const result = await deleteDailyLogAction(dailyLogId);

      if ("error" in result) {
        setError(result.error ?? "수업일지를 삭제하지 못했어요. 다시 시도해주세요.");
        return;
      }

      // 같은 날짜의 목록으로 복귀 (달력 선택 유지) + 삭제 안내 배너
      const month = result.classDate.slice(0, 7);
      router.replace(`/daily-logs?month=${month}&date=${result.classDate}&deleted=1`);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-[#f0d9d5] text-[#a26660] hover:bg-[#fff5f2] hover:text-[#8a5048]"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" /> 삭제
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="수업일지 삭제 확인"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              setOpen(false);
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="text-lg font-semibold text-[#2a2323]">수업일지를 삭제할까요?</div>

            <div className="mt-3 rounded-2xl bg-[#f8f3ef] p-3 text-sm">
              <div className="font-semibold text-[#2b2323]">{groupName}</div>
              <div className="mt-0.5 tabular-nums text-[#655d5d]">
                {dateLabel}
                {timeRange ? ` · ${timeRange}` : ""}
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#7f5d57]">
              삭제하면 이 수업일지에 연결된 학생별 출결·평가·칭찬 기록과 아직 처리하지 않은 보충
              항목이 함께 삭제돼요. 이미 완료한 보충수업 이력은 남아요.
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
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={confirmDelete}
                className="gap-1.5 bg-[#a2564d] text-white hover:bg-[#8f4a42]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isPending ? "삭제 중..." : "수업일지 삭제"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
