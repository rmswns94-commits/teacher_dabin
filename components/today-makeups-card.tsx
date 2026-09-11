"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";

import { MakeupCompleteDialog } from "@/components/makeup-complete-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TodayScheduledMakeup } from "@/lib/supabase/queries/makeups";

// Today Dashboard의 "오늘 보충 수업" — 오늘 실제로 해야 하는 보충만 보여주는 compact 카드.
// 보충 record 자체를 읽어 표시할 뿐 Todo를 만들지 않고, 정규 수업 Next Class 계산과도 무관하다.
// [완료]는 보충 수업 탭과 똑같은 MakeupCompleteDialog를 연다 — 입력 항목/검증/저장이 한 벌이고,
// 저장이 끝나면 completeMakeupAction의 revalidate가 이 카드도 함께 갱신한다.
export function TodayMakeupsCard({ makeups, today }: { makeups: TodayScheduledMakeup[]; today: string }) {
  const [completing, setCompleting] = useState<TodayScheduledMakeup | null>(null);

  // 오늘 할 보충이 없으면 카드 자체를 띄우지 않는다 (빈 카드로 자리를 차지하지 않음)
  if (makeups.length === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[#a2643c]" /> 오늘 보충 수업
            </CardTitle>
            <span className="secondary-text tabular-nums text-[#8a7b77]">{makeups.length}건</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {makeups.map((makeup) => (
            <div
              key={makeup.id}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-1.5"
            >
              {/* 보충 예정 시간 — 원래 반 수업시간이 아니라 이 보충 자체의 시간 */}
              <span className="shrink-0 text-base font-semibold tabular-nums text-[#a2643c]">
                {makeup.startTime
                  ? makeup.endTime
                    ? `${makeup.startTime} ~ ${makeup.endTime}`
                    : makeup.startTime
                  : "시간 미정"}
              </span>
              <span className="body-text min-w-0 flex-1 break-words text-[#2d2928]">
                {makeup.studentName}
                {makeup.groupName ? (
                  <span className="text-[#8a7b77]"> · {makeup.groupName}</span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => setCompleting(makeup)}
              >
                완료
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {completing ? (
        <MakeupCompleteDialog
          row={{
            id: completing.id,
            studentName: completing.studentName,
            groupName: completing.groupName,
            missedProgress: completing.missedProgress,
            scheduledDate: completing.scheduledDate,
            comment: completing.comment,
          }}
          today={today}
          onClose={() => setCompleting(null)}
        />
      ) : null}
    </>
  );
}
