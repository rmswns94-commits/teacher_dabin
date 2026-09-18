"use client";

import { useRef, useState, useTransition } from "react";

import { setHolidayClassAction, setHolidayClassBulkAction } from "@/app/daily-logs/holiday-actions";
import { Button } from "@/components/ui/button";
import { summarizeHolidayBulk } from "@/lib/holiday-bulk";
import { cn } from "@/lib/utils";

// 공휴일 날짜 상세 — 그 요일에 정규수업이 있는 반들의 상태와 토글.
//
// - 반별 토글: 이 반의 이 날 수업만 정상 진행/공휴일 휴강 (occurrence 단위)
// - 일괄 토글: 공휴일 때문에만 쉬는 수업들을 한 번에 (개별 휴강·이동·시간 변경은 건드리지 않는다)
// 저장 중에는 이 패널의 모든 버튼을 잠근다 — 두 번 눌러도 요청은 하나다.

export type HolidayClassRow = {
  scheduleId: string;
  groupId: string;
  groupName: string;
  groupIcon: string;
  startTime: string;
  endTime: string;
  isNormalClass: boolean;
  // 이 occurrence에 걸린 1회 변경 종류 (null = 공휴일 때문에만 쉬는 상태)
  exceptionKind: "cancelled" | "time_override" | "moved" | "holiday_class" | null;
  // 그날 이 반에 이미 다른 실제 수업(보강·옮겨온 수업)이 있어 정상 수업으로 되살릴 수 없는 상태
  blockedByOtherClass?: boolean;
};

export function HolidayClassPanel({
  date,
  names,
  rows,
}: {
  date: string;
  names: string[];
  rows: HolidayClassRow[];
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);

  // 일괄 대상 판정은 서버 action과 같은 helper를 쓴다 (규칙이 갈라지지 않게)
  const { mode: bulkMode, count: bulkCount, show: showBulk } = summarizeHolidayBulk(rows);

  const run = (task: () => Promise<{ error: string } | { success: true; changed?: number }>, done: (changed: number) => void) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await task();
        if ("error" in result) {
          setError(result.error);
          return;
        }
        done(result.changed ?? 0);
      } finally {
        busyRef.current = false;
      }
    });
  };

  const toggleOne = (row: HolidayClassRow) =>
    run(
      () =>
        setHolidayClassAction({
          groupId: row.groupId,
          scheduleId: row.scheduleId,
          date,
          enabled: !row.isNormalClass,
        }),
      () => {},
    );

  const runBulk = () =>
    run(
      () => setHolidayClassBulkAction({ date, enabled: bulkMode === "enable" }),
      (changed) => {
        setConfirmOpen(false);
        setNotice(
          bulkMode === "enable"
            ? `${changed}개 수업을 정상 수업으로 변경했어요.`
            : `${changed}개 수업을 공휴일 휴강으로 변경했어요.`,
        );
      },
    );

  return (
    <div className="mt-3">
      <h3 className="card-title text-[#b05a63]">{names.join(", ")}</h3>

      {rows.length === 0 ? (
        <p className="mt-1.5 text-sm text-[#a08d97]">이 날짜에 정규수업이 있는 반이 없어요.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {rows.map((row) => (
              <li
                key={row.scheduleId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-[#f0dde0] bg-[#fffafa] px-3.5 py-2.5 text-sm"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex min-w-0 items-center gap-1 font-medium text-[#232327]">
                    <span aria-hidden>{row.groupIcon}</span>
                    <span className="min-w-0 truncate">{row.groupName}</span>
                  </span>
                  <span className="tabular-nums text-[#33333b]">
                    {row.startTime} ~ {row.endTime}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      row.isNormalClass ? "bg-[#e4f4ec] text-[#3d7f64]" : "bg-[#fdeef0] text-[#b05a63]",
                    )}
                  >
                    {row.isNormalClass ? "정상 수업" : "공휴일 휴강"}
                  </span>
                  {!row.isNormalClass && row.blockedByOtherClass ? (
                    <span className="secondary-text text-[#8a7b77]">
                      이미 이 반의 다른 수업이 있는 날이에요
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant={row.isNormalClass ? "secondary" : "outline"}
                  size="sm"
                  disabled={isPending || (!row.isNormalClass && Boolean(row.blockedByOtherClass))}
                  aria-label={`${row.groupName} ${row.isNormalClass ? "공휴일 처리" : "정상 수업날로 변경"}`}
                  onClick={() => toggleOne(row)}
                >
                  {isPending ? "변경 중…" : row.isNormalClass ? "공휴일 처리" : "정상 수업날로 변경"}
                </Button>
              </li>
            ))}
          </ul>

          {showBulk ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              aria-label={bulkMode === "enable" ? "전체 정상 수업날로 변경" : "전체 공휴일 처리"}
              onClick={() => {
                setError("");
                setNotice("");
                setConfirmOpen(true);
              }}
              className="mt-2 w-full"
            >
              {isPending
                ? "변경 중…"
                : bulkMode === "enable"
                  ? `전체 정상 수업날로 변경 (${bulkCount}개)`
                  : `전체 공휴일 처리 (${bulkCount}개)`}
            </Button>
          ) : null}
        </>
      )}

      {error ? (
        <p role="status" className="mt-2 text-sm text-[#a05252]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-sm text-[#3d7f64]">
          {notice}
        </p>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b2323]/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={bulkMode === "enable" ? "전체 정상 수업 확인" : "전체 공휴일 처리 확인"}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) {
              setConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
            <div className="text-lg font-semibold text-[#2a2323]">
              {bulkMode === "enable"
                ? "이 공휴일의 정규수업을 모두 정상 수업으로 변경할까요?"
                : "이 날짜의 정상 수업 설정을 모두 해제할까요?"}
            </div>

            <p className="mt-3 text-sm leading-5 text-[#7f5d57]">
              {bulkMode === "enable"
                ? "이미 개별로 휴강하거나 다른 날짜로 옮긴 수업은 그대로 둡니다."
                : "해제하면 해당 수업들은 다시 공휴일 휴강으로 처리됩니다."}
            </p>

            <div className="mt-3 rounded-2xl bg-[#f8f3ef] px-3 py-2 text-sm font-semibold tabular-nums text-[#2b2323]">
              대상 수업 {bulkCount}개
            </div>

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
              <Button type="button" size="sm" disabled={isPending} onClick={runBulk}>
                {isPending ? "변경 중…" : bulkMode === "enable" ? "전체 정상수업" : "전체 공휴일 처리"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
