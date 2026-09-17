"use client";

import { useRef, useState, useTransition } from "react";

import { setHolidayClassAction } from "@/app/daily-logs/holiday-actions";
import { Button } from "@/components/ui/button";

// 공휴일 날짜 상세의 반별 토글 — 이 반의 이 날 수업만 정상 진행/공휴일 휴강으로 바꾼다.
// occurrence 단위(schedule_id + 날짜)라 같은 날 다른 반은 영향이 없다.
export function HolidayClassToggle({
  groupId,
  scheduleId,
  date,
  groupName,
  isNormalClass,
}: {
  groupId: string;
  scheduleId: string;
  date: string;
  groupName: string;
  isNormalClass: boolean;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);

  const toggle = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await setHolidayClassAction({
          groupId,
          scheduleId,
          date,
          enabled: !isNormalClass,
        });
        if ("error" in result) {
          setError(result.error);
        }
      } finally {
        busyRef.current = false;
      }
    });
  };

  return (
    <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {error ? (
        <span role="status" className="secondary-text min-w-0 text-[#a05252]">
          {error}
        </span>
      ) : null}
      <Button
        type="button"
        variant={isNormalClass ? "secondary" : "outline"}
        size="sm"
        disabled={isPending}
        aria-label={`${groupName} ${isNormalClass ? "공휴일 처리" : "정상 수업날로 변경"}`}
        onClick={toggle}
      >
        {isPending ? "변경 중…" : isNormalClass ? "공휴일 처리" : "정상 수업날로 변경"}
      </Button>
    </span>
  );
}
