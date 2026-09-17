"use client";

// 학생 상세의 재원/휴원/퇴원/반 이동 액션 — 전부 soft 처리 (hard delete 아님).
// - 휴원/퇴원: confirm dialog(기록 보존 안내)를 거쳐 setStudentStatusAction 호출.
// - 반 이동: 이동할 기존 반(멤버십 하나)만 골라 새 반으로 — 다른 동시 소속은 유지.
//   과거 일지 기록은 원래 반 스냅샷으로 그대로 남는다는 안내를 dialog에 명시.
//   적용일 입력은 두지 않는다 — 현재 데이터 모델(멤버십에 기간 없음)에서 날짜를 받으면
//   잘못된 이력처럼 보이므로, 이동은 즉시 현재 roster에만 적용된다.
// - mutation pending 중 버튼 disabled + busy ref로 double-submit 방지.
// - 성공 시 4초 notice, 실패 시 에러 문구(원본 DB 에러 비노출) — 거짓 성공 없음.

import { useRef, useState, useTransition } from "react";
import { ArrowRightLeft, PauseCircle, PlayCircle, UserRoundMinus } from "lucide-react";

import { setStudentStatusAction, transferStudentGroupAction } from "@/app/students/actions";
import { Button } from "@/components/ui/button";
import type { StudentLifecycleStatus } from "@/lib/student-lifecycle";
import { lifecycleLabels } from "@/lib/student-lifecycle";

type GroupOption = { id: string; name: string };

type ConfirmKind = "paused" | "withdrawn" | "active" | null;

export function StudentLifecycleActions({
  studentId,
  studentName,
  status,
  memberGroups,
  allGroups,
}: {
  studentId: string;
  studentName: string;
  status: StudentLifecycleStatus;
  // 학생이 현재 속한 그룹들 (반 이동의 source 후보)
  memberGroups: GroupOption[];
  // 이동 가능한 전체 그룹 (target 후보 — 현재 소속은 제외해서 보여준다)
  allGroups: GroupOption[];
}) {
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [fromGroupId, setFromGroupId] = useState("");
  const [toGroupId, setToGroupId] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  const showNotice = (tone: "ok" | "error", text: string) => {
    setNotice({ tone, text });
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4000);
  };

  const runStatusChange = (next: "active" | "paused" | "withdrawn", successText: string) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    startTransition(async () => {
      try {
        const result = await setStudentStatusAction(studentId, next);
        if ("error" in result) {
          showNotice("error", result.error);
          return;
        }
        setConfirm(null);
        showNotice("ok", successText);
      } finally {
        busyRef.current = false;
      }
    });
  };

  const openTransfer = () => {
    setFromGroupId(memberGroups[0]?.id ?? "");
    setToGroupId("");
    setTransferOpen(true);
  };

  const memberIds = new Set(memberGroups.map((group) => group.id));
  const targetOptions = allGroups.filter((group) => !memberIds.has(group.id));
  const toName = allGroups.find((group) => group.id === toGroupId)?.name ?? "";

  const runTransfer = () => {
    if (busyRef.current || !fromGroupId || !toGroupId || fromGroupId === toGroupId) {
      return;
    }
    busyRef.current = true;
    startTransition(async () => {
      try {
        const result = await transferStudentGroupAction(studentId, fromGroupId, toGroupId);
        if ("error" in result) {
          showNotice("error", result.error);
          return;
        }
        setTransferOpen(false);
        showNotice("ok", `${studentName} 학생을 ${toName}(으)로 이동했어요.`);
      } finally {
        busyRef.current = false;
      }
    });
  };

  return (
    <div className="mt-5 border-t border-dashed border-[#f0e7e2] pt-4">
      <div className="form-label font-semibold text-[#8a7b77]">상태 관리 · {lifecycleLabels[status]}</div>
      <p className="secondary-text mt-1 text-[#a89a95]">
        휴원·퇴원 처리해도 지금까지의 수업 일지, 출결, 숙제, 보충, 성장 기록은 모두 보존돼요.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {status === "active" ? (
          <>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm("paused")}>
              <PauseCircle className="h-4 w-4" aria-hidden /> 휴원 처리
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm("withdrawn")}>
              <UserRoundMinus className="h-4 w-4" aria-hidden /> 퇴원 처리
            </Button>
            {memberGroups.length > 0 && targetOptions.length > 0 ? (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openTransfer}>
                <ArrowRightLeft className="h-4 w-4" aria-hidden /> 반 이동
              </Button>
            ) : null}
          </>
        ) : status === "paused" ? (
          <>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm("active")}>
              <PlayCircle className="h-4 w-4" aria-hidden /> 재원으로 복귀
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm("withdrawn")}>
              <UserRoundMinus className="h-4 w-4" aria-hidden /> 퇴원 처리
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm("active")}>
            <PlayCircle className="h-4 w-4" aria-hidden /> 재원으로 복귀
          </Button>
        )}
      </div>
      {notice ? (
        <p
          role="status"
          className={
            notice.tone === "ok"
              ? "mt-2.5 rounded-xl border border-[#d8ebe0] bg-[#f0faf5] px-3 py-2 text-sm text-[#2f6d54]"
              : "mt-2.5 rounded-xl border border-[#f0d9d5] bg-[#fff9f7] px-3 py-2 text-sm text-[#a05252]"
          }
        >
          {notice.text}
        </p>
      ) : null}

      {/* 휴원/퇴원/복귀 confirm */}
      {confirm ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="학생 상태 변경 확인"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              event.stopPropagation();
              setConfirm(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">
              {confirm === "paused"
                ? `${studentName} 학생을 휴원 처리할까요?`
                : confirm === "withdrawn"
                  ? `${studentName} 학생을 퇴원 처리할까요?`
                  : `${studentName} 학생을 재원으로 복귀할까요?`}
            </div>
            <p className="mt-2 text-sm leading-5 text-[#655d5d]">
              {confirm === "active" ? (
                <>다시 현재 수업 명단에 표시돼요. 소속 반이 없다면 학생 정보 수정에서 반을 배정해주세요.</>
              ) : (
                <>
                  {confirm === "paused" ? "휴원" : "퇴원"} 처리해도 기존 수업 일지와 출결, 숙제,
                  보충, 성장 기록은 삭제되지 않아요. 이미 등록된 숙제와 보충 일정도 유지돼요.
                  <br />
                  새로운 수업 일지의 현재 학생 명단에서는 제외돼요.
                </>
              )}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={() => setConfirm(null)}
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={isPending}
                onClick={() =>
                  confirm === "paused"
                    ? runStatusChange("paused", `${studentName} 학생을 휴원 처리했어요.`)
                    : confirm === "withdrawn"
                      ? runStatusChange("withdrawn", `${studentName} 학생을 퇴원 처리했어요.`)
                      : runStatusChange("active", `${studentName} 학생이 재원으로 복귀했어요.`)
                }
              >
                {isPending
                  ? "처리 중…"
                  : confirm === "paused"
                    ? "휴원 처리"
                    : confirm === "withdrawn"
                      ? "퇴원 처리"
                      : "재원으로 복귀"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 반 이동 dialog */}
      {transferOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="반 이동"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              event.stopPropagation();
              setTransferOpen(false);
            }
          }}
        >
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">반 이동</div>
            <p className="mt-2 text-sm leading-5 text-[#655d5d]">
              {studentName} 학생의 선택한 반 소속만 새 반으로 바뀌어요. 다른 반 소속은 그대로
              유지되고, 지난 수업 일지 기록은 원래 반에 그대로 남아요. 이동은 지금부터의 새 수업에
              적용돼요.
            </p>

            <label className="mt-3 block">
              <span className="form-label mb-1.5 block font-semibold text-[#7c6d69]">현재 반</span>
              <select
                value={fromGroupId}
                onChange={(event) => setFromGroupId(event.target.value)}
                disabled={isPending}
                aria-label="이동할 기존 반 선택"
                className="min-h-[42px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none focus:border-[#c9b9e8]"
              >
                {memberGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="form-label mb-1.5 block font-semibold text-[#7c6d69]">이동할 반</span>
              <select
                value={toGroupId}
                onChange={(event) => setToGroupId(event.target.value)}
                disabled={isPending}
                aria-label="이동할 새 반 선택"
                className="min-h-[42px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-2.5 py-1.5 text-base outline-none focus:border-[#c9b9e8]"
              >
                <option value="">반 선택</option>
                {targetOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            {notice && notice.tone === "error" ? (
              <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {notice.text}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={() => setTransferOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={isPending || !fromGroupId || !toGroupId}
                onClick={runTransfer}
              >
                {isPending ? "이동 중…" : "반 이동"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
