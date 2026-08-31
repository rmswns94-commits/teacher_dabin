import Link from "next/link";
import { BookOpen, CircleArrowRight, NotebookTabs, PencilLine } from "lucide-react";

import { AttendanceBadge, DailyLogStatusBadge, MakeupStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import type { DailyLogDetail } from "@/lib/supabase/queries/daily-logs";

// 캘린더 Master-Detail 오른쪽에 embed되는 수업 일지 상세 뷰 (읽기 전용).
export function LessonLogDetail({
  detail,
  timeRange,
}: {
  detail: DailyLogDetail;
  timeRange: string | null;
}) {
  const counts = { present: 0, late: 0, absent: 0 };
  for (const log of detail.lessonLogs) {
    counts[log.attendance] += 1;
  }

  const makeupByLessonLog = new Map(
    detail.makeups
      .filter((makeup) => makeup.student_lesson_log_id)
      .map((makeup) => [makeup.student_lesson_log_id, makeup]),
  );

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[#2d2928]">
              {detail.group?.name ?? "수업 그룹"}
            </div>
            <div className="mt-0.5 text-sm tabular-nums text-[#7b746f]">
              {formatKoreanDate(detail.class_date, true)}
              {timeRange ? ` · ${timeRange}` : ""}
            </div>
            <div className="mt-1.5">
              <DailyLogStatusBadge status={detail.status} />
            </div>
          </div>
          <Button variant="secondary" size="sm" className="gap-1.5" asChild>
            <Link href={`/daily-logs/${detail.id}/edit`}>
              <PencilLine className="h-3.5 w-3.5" /> 수정
            </Link>
          </Button>
        </div>

        {detail.title || detail.lesson_content ? (
          <div className="mt-4 text-sm leading-6 text-[#564d4d]">
            {detail.title ? <div className="font-medium text-[#2d2928]">{detail.title}</div> : null}
            {detail.lesson_content ? <div className="mt-0.5">{detail.lesson_content}</div> : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl bg-[#f5f1fb] p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6d5aa8]">
            <BookOpen className="h-3.5 w-3.5" aria-hidden /> 오늘의 진도
          </div>
          <div className="mt-1 whitespace-pre-line text-sm leading-6 text-[#3d3450]">
            {detail.default_progress || "기록된 진도가 없어요."}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="rounded-full bg-[#e4f4ec] px-2 py-1 tabular-nums text-[#3d7f64]">출석 {counts.present}</span>
            <span className="rounded-full bg-[#fdf3e4] px-2 py-1 tabular-nums text-[#94702f]">지각 {counts.late}</span>
            <span className="rounded-full bg-[#f9e7e5] px-2 py-1 tabular-nums text-[#a26660]">결석 {counts.absent}</span>
          </div>

          <div className="mt-2 divide-y divide-dashed divide-[#f4e2e8]">
            {detail.lessonLogs.map((lessonLog) => {
              const makeup = makeupByLessonLog.get(lessonLog.id);

              return (
                <div key={lessonLog.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#2d2928]">
                      {lessonLog.student?.name ?? "학생"}
                    </span>
                    <AttendanceBadge status={lessonLog.attendance} />
                  </div>

                  {lessonLog.attendance === "absent" ? (
                    <div className="mt-1.5 rounded-xl bg-[#fff5f2] p-2.5 text-xs leading-5 text-[#8a5d52]">
                      <div>놓친 진도: {makeup?.missed_progress || "기록 없음"}</div>
                      {makeup ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <MakeupStatusBadge status={makeup.status} />
                          {makeup.status === "scheduled" ? (
                            <span>보충 예정 {formatKoreanDate(makeup.scheduled_date)}</span>
                          ) : null}
                          {makeup.status === "completed" ? (
                            <span>{formatKoreanDate(makeup.completed_date)} 보충 완료</span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1">보충 없이 넘어가기로 했어요.</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 space-y-0.5 text-xs leading-5">
                      {lessonLog.progress ? (
                        <div className="text-[#564d4d]">진도 · {lessonLog.progress}</div>
                      ) : null}
                      {lessonLog.strengths ? (
                        <div className="text-[#3d6d58]">잘한 점 · {lessonLog.strengths}</div>
                      ) : null}
                      {lessonLog.improvements ? (
                        <div className="text-[#8a5d52]">보완 · {lessonLog.improvements}</div>
                      ) : null}
                      {lessonLog.memo ? (
                        <div className="text-[#8a7b77]">메모 · {lessonLog.memo}</div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {detail.homework ? (
          <div className="mt-3 rounded-2xl bg-[#fdf6ec] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#94702f]">
              <NotebookTabs className="h-3.5 w-3.5" aria-hidden /> 오늘 숙제
            </div>
            <div className="mt-1 whitespace-pre-line text-sm leading-6 text-[#5c4a2e]">
              {detail.homework}
            </div>
          </div>
        ) : null}

        {detail.next_lesson_plan ? (
          <div className="mt-3 rounded-2xl bg-[#eef7f2] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3e7d6b]">
              <CircleArrowRight className="h-3.5 w-3.5" aria-hidden /> 다음 수업
            </div>
            <div className="mt-1 whitespace-pre-line text-sm leading-6 text-[#33473f]">
              {detail.next_lesson_plan}
            </div>
          </div>
        ) : null}

        {detail.memo ? (
          <div className="mt-3 text-xs text-[#8a7b77]">수업 메모 · {detail.memo}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
