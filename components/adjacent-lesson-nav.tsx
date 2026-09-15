"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExamPeriodMark } from "@/components/exam-period-mark";
import { anyRegisteredFormDirty, ConfirmDiscardDialog } from "@/components/unsaved-guard";
import type { AdjacentClassTarget } from "@/lib/adjacent-classes";

// Daily Log 이전/다음 수업 바로가기 — 같은 날짜(lesson_date)의 정규 수업 사이만 이동한다.
// 목적지는 항상 공용 진입 resolver(/daily-logs/new?groupId&date): 그 identity의 일지가
// 있으면 이어쓰기/수정으로 redirect, 없으면 새 작성 폼 — 버튼 클릭만으로는 DB에 아무것도
// 만들지 않는다. dirty 폼 보호는 PageBackButton과 동일한 registry+확인 다이얼로그 재사용.
export function AdjacentLessonNav({
  previous,
  next,
  date,
}: {
  previous: AdjacentClassTarget | null;
  next: AdjacentClassTarget | null;
  date: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<AdjacentClassTarget | null>(null);

  if (!previous && !next) {
    return null;
  }

  const go = (target: AdjacentClassTarget) => {
    // 공용 resolver로 이동 — 날짜는 현재 lesson_date 그대로 (다음 날짜 이동 없음)
    startTransition(() => {
      router.push(`/daily-logs/new?groupId=${target.groupId}&date=${date}`);
    });
  };

  const handleClick = (target: AdjacentClassTarget) => {
    // 이동 처리 중 재탭 무시 — 중복/뒤늦은 이중 navigation 방지
    if (isPending) {
      return;
    }
    if (anyRegisteredFormDirty()) {
      setConfirmTarget(target);
      return;
    }
    go(target);
  };

  const targetButton = (target: AdjacentClassTarget, direction: "previous" | "next") => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => handleClick(target)}
      aria-label={`${direction === "previous" ? "이전" : "다음"} 수업 ${target.groupName}(으)로 이동`}
      className="min-w-0 max-w-full gap-1.5"
    >
      {direction === "previous" ? <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 truncate">{target.groupName}</span>
      <ExamPeriodMark show={target.isExamPeriod} className="text-xs" />
      <span className="shrink-0 text-xs font-normal text-[#8a7b77]">{target.startTime}</span>
      {direction === "next" ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
    </Button>
  );

  return (
    <>
      <nav
        aria-label="같은 날 다른 수업으로 이동"
        className="mb-5 flex flex-wrap items-center justify-between gap-2"
      >
        {/* 첫 수업이면 왼쪽은 비워 둔다 (자리 유지용 빈 span — next가 오른쪽에 붙게) */}
        {previous ? targetButton(previous, "previous") : <span aria-hidden />}
        {next ? targetButton(next, "next") : <span aria-hidden />}
      </nav>

      <ConfirmDiscardDialog
        open={confirmTarget !== null}
        onKeepEditing={() => setConfirmTarget(null)}
        onDiscard={() => {
          const target = confirmTarget;
          setConfirmTarget(null);
          if (target) {
            go(target);
          }
        }}
      />
    </>
  );
}
