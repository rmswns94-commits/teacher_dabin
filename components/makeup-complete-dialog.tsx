"use client";

import { useState, useTransition } from "react";

import { completeMakeupAction } from "@/app/makeups/actions";
import { Button } from "@/components/ui/button";

// 보충 완료 입력창 — 구현은 이 파일 한 벌뿐이고, 보충 수업 탭과 Today Dashboard가
// 같은 컴포넌트를 그대로 쓴다 (같은 form / 같은 validation / 같은 server action).
// 화면별로 복사해 두면 한쪽만 고쳐져 완료 기록이 갈라지므로 절대 복제하지 않는다.

export const dialogInputClass =
  "form-control-text w-full rounded-xl border border-[#dcdce2] bg-white px-3 py-2 text-[#33333b] outline-none focus:border-[#b9b9c6]";
export const dialogLabelClass = "form-label mb-1 block text-[#6b6b74]";

// 공용 다이얼로그 shell (dirty면 바깥 클릭/ESC에서 확인)
export function DialogShell({
  title,
  dirty,
  onClose,
  children,
}: {
  title: string;
  dirty: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const requestClose = () => {
    if (!dirty || window.confirm("작성 중인 내용이 있어요. 저장하지 않고 닫을까요?")) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#26262b]/35 px-4"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#e6e6ea] bg-white p-5 shadow-xl">
        <div className="card-title text-[#232327]">{title}</div>
        {children}
      </div>
    </div>
  );
}

// 완료 입력에 필요한 최소 정보만 받는다 — 보충 보드의 MakeupRow도 이 모양을 만족하므로
// 두 화면이 같은 컴포넌트를 쓰면서 서로의 타입에 얽히지 않는다.
export type MakeupCompletionTarget = {
  id: string;
  studentName: string;
  groupName: string | null;
  missedProgress: string | null;
  scheduledDate: string | null;
  comment: string | null;
};

export function MakeupCompleteDialog({
  row,
  today,
  onClose,
}: {
  row: MakeupCompletionTarget;
  today: string;
  onClose: () => void;
}) {
  const [completedDate, setCompletedDate] = useState(row.scheduledDate ?? today);
  const [content, setContent] = useState(row.missedProgress ?? "");
  const [comment, setComment] = useState(row.comment ?? "");
  const [followUp, setFollowUp] = useState<"none" | "needed">("none");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const dirty =
    content !== (row.missedProgress ?? "") || comment !== (row.comment ?? "") || followUp !== "none";

  const submit = () => {
    setError("");
    startTransition(async () => {
      const result = await completeMakeupAction(row.id, {
        completedDate,
        completedProgress: content,
        comment: followUp === "needed" ? `${comment ? `${comment}\n` : ""}[추가 보충 필요]` : comment,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      onClose();
    });
  };

  return (
    <DialogShell title="보충 완료" dirty={dirty} onClose={onClose}>
      <div className="secondary-text mt-1 text-[#6b6b74]">
        {row.studentName}
        {row.groupName ? ` · ${row.groupName}` : ""}
      </div>
      {row.missedProgress ? (
        <div className="mt-2 whitespace-pre-line break-words body-text rounded-xl bg-[#f4f4f6] px-3 py-2 text-[#4c4c55]">
          놓친 진도 · {row.missedProgress}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className={dialogLabelClass}>실제 보충일</span>
          <input
            type="date"
            value={completedDate}
            onChange={(e) => setCompletedDate(e.target.value)}
            className={dialogInputClass}
          />
        </label>
        <label className="block">
          <span className={dialogLabelClass}>실제 보충 내용</span>
          {/* 놓친 진도가 여러 줄이면 기본값도 여러 줄 — textarea로 그대로 편집 */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className={`${dialogInputClass} leading-6`}
            placeholder="관계대명사 목적격 설명 및 문제풀이"
          />
        </label>
        <label className="block">
          <span className={dialogLabelClass}>학생 상태 / 메모</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className={dialogInputClass}
            placeholder="이해 잘함"
          />
        </label>
        <fieldset>
          <legend className={dialogLabelClass}>추가 보충</legend>
          <div className="flex gap-2">
            {(
              [
                ["none", "필요 없음"],
                ["needed", "추가 보충 필요"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={followUp === value}
                onClick={() => setFollowUp(value)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                  followUp === value
                    ? "border-[#cfc4f0] bg-[#efe8fb] text-[#4a3c8f]"
                    : "border-[#e2e2e8] bg-white text-[#4c4c55]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {error ? <p className="secondary-text text-[#a2665f]">{error}</p> : null}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          취소
        </Button>
        {/* isPending 가드 — 빠르게 여러 번 눌러도 완료 mutation은 한 번만 */}
        <Button type="button" size="sm" disabled={isPending || !completedDate} onClick={submit}>
          {isPending ? "저장 중..." : "완료 저장"}
        </Button>
      </div>
    </DialogShell>
  );
}
