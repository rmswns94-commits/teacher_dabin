import Link from "next/link";
import { BookOpen, CircleArrowRight, NotebookTabs, PencilLine } from "lucide-react";

import { DailyLogDeleteButton } from "@/components/daily-log-delete-button";
import { AttendanceBadge, DailyLogStatusBadge, MakeupStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import { mergeLegacyLessonContent } from "@/lib/progress";
import {
  effortLevelLabels,
  focusLevelLabels,
  homeworkStatusLabels,
  kindnessLevelLabels,
  participationLevelLabels,
  praiseCategoryLabels,
  questionLevelLabels,
  vocabPercent,
} from "@/lib/elementary";
import type { DailyLogDetail } from "@/lib/supabase/queries/daily-logs";
import type { PraiseCategory } from "@/lib/supabase/types";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-dashed border-[#f0dae2] pt-4 text-xs font-semibold uppercase tracking-[0.1em] text-[#8f5470]">
      {children}
    </div>
  );
}

// 캘린더 Master-Detail 오른쪽에 embed되는 수업 일지 상세 뷰 (읽기 전용).
// "그날 이 반에서 실제로 무엇을 했는지" 일지를 펼쳐보듯 상세하게 보여준다.
export function LessonLogDetail({
  detail,
  timeRange,
  praises = [],
}: {
  detail: DailyLogDetail;
  timeRange: string | null;
  praises?: { student_id: string; category: string; comment?: string | null }[];
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

  // 칭찬 한표(comment)는 문장 chip으로, legacy category 칭찬은 라벨 chip으로
  // 학생 이름 옆에 표시 (기존 표기 방식)
  const praisesByStudent = new Map<string, string[]>();
  for (const praise of praises) {
    const label = praise.comment
      ? `💜 ${praise.comment}`
      : `⭐ ${praiseCategoryLabels[praise.category as PraiseCategory] ?? praise.category}`;
    praisesByStudent.set(praise.student_id, [
      ...(praisesByStudent.get(praise.student_id) ?? []),
      label,
    ]);
  }

  const vocabRows = detail.lessonLogs.filter((log) => log.vocab_correct !== null);
  const parentNoteRows = detail.lessonLogs.filter((log) => log.parent_note);

  return (
    <Card>
      <CardContent className="p-5">
        {/* 수업 정보 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[#2d2928]">
              {detail.group?.name ?? "수업 그룹"}
            </div>
            <div className="mt-0.5 text-sm tabular-nums text-[#7b746f]">
              {formatKoreanDate(detail.class_date, true)}
              {timeRange ? ` · ${timeRange}` : ""}
            </div>
            {detail.group ? (
              <div className="mt-1.5">
                <Link
                  href={`/groups/${detail.group.id}`}
                  className="text-xs text-[#5c4ca8] hover:underline"
                >
                  반 보기
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5" asChild>
              <Link href={`/daily-logs/${detail.id}/edit`}>
                <PencilLine className="h-3.5 w-3.5" /> 수정하기
              </Link>
            </Button>
            <DailyLogDeleteButton
              dailyLogId={detail.id}
              groupName={detail.group?.name ?? "수업 그룹"}
              dateLabel={formatKoreanDate(detail.class_date, true)}
              timeRange={timeRange}
            />
          </div>
        </div>

        {/* 수업 요약 — 상태 · 수업 제목 · 공통 진도 (수업 내용은 공통 진도로 통합됨) */}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-[#f8f3ef] p-3.5">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b7b77]">
              상태
            </div>
            <div className="mt-2">
              <DailyLogStatusBadge status={detail.status} />
            </div>
          </div>
          <div className="rounded-2xl bg-[#f5f2ff] p-3.5">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b7b77]">
              수업 제목
            </div>
            <div className="mt-1.5 text-sm font-medium leading-6 text-[#2a2323]">
              {detail.title || "입력된 제목이 없어요."}
            </div>
          </div>
          <div className="rounded-2xl bg-[#edf9f3] p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> 공통 진도
            </div>
            <div className="mt-1.5 whitespace-pre-line text-sm font-medium leading-6 text-[#2a2323]">
              {mergeLegacyLessonContent(detail.default_progress, detail.lesson_content) ||
                "기록된 진도가 없어요."}
            </div>
          </div>
        </div>

        {detail.homework || detail.next_lesson_plan ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {detail.homework ? (
              <div className="rounded-2xl bg-[#fdf6ec] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#94702f]">
                  <NotebookTabs className="h-3.5 w-3.5" aria-hidden /> 오늘 숙제
                </div>
                <div className="mt-1.5 whitespace-pre-line text-sm leading-6 text-[#5c4a2e]">
                  {detail.homework}
                </div>
              </div>
            ) : null}
            {detail.next_lesson_plan ? (
              <div className="rounded-2xl bg-[#eef7f2] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
                  <CircleArrowRight className="h-3.5 w-3.5" aria-hidden /> 다음 수업 계획
                </div>
                <div className="mt-1.5 whitespace-pre-line text-sm leading-6 text-[#33473f]">
                  {detail.next_lesson_plan}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {detail.memo ? (
          <div className="mt-3 rounded-2xl bg-[#f8f3ef] p-3.5 text-sm leading-6 text-[#564d4d]">
            <span className="font-semibold text-[#4d3a3a]">수업 메모</span> · {detail.memo}
          </div>
        ) : null}

        {/* 출결 + 학생별 기록 */}
        <SectionHeading>출결 · 학생 기록</SectionHeading>
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="rounded-full bg-[#e4f4ec] px-2 py-1 tabular-nums text-[#3d7f64]">출석 {counts.present}</span>
          <span className="rounded-full bg-[#fdf3e4] px-2 py-1 tabular-nums text-[#94702f]">지각 {counts.late}</span>
          <span className="rounded-full bg-[#f9e7e5] px-2 py-1 tabular-nums text-[#a26660]">결석 {counts.absent}</span>
        </div>

        <div className="mt-2 divide-y divide-dashed divide-[#f4e2e8]">
          {detail.lessonLogs.map((lessonLog) => {
            const makeup = makeupByLessonLog.get(lessonLog.id);
            const studentPraises = lessonLog.student
              ? (praisesByStudent.get(lessonLog.student.id) ?? [])
              : [];

            return (
              <div key={lessonLog.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[#2d2928]">
                    {lessonLog.student?.name ?? "학생"}
                  </span>
                  <AttendanceBadge status={lessonLog.attendance} />
                  {studentPraises.map((label, praiseIndex) => (
                    <span
                      key={`${label}-${praiseIndex}`}
                      className="rounded-full bg-[#fdf3e4] px-1.5 py-0.5 text-[10px] text-[#8a6828]"
                    >
                      {label}
                    </span>
                  ))}
                </div>

                {lessonLog.attendance === "absent" ? (
                  <div className="mt-1.5 rounded-xl bg-[#fff5f2] p-2.5 text-xs leading-5 text-[#8a5d52]">
                    <div>놓친 진도: {makeup?.missed_progress || "기록 없음"}</div>
                    {makeup ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <MakeupStatusBadge status={makeup.status} />
                        {makeup.status === "required" ? <span>보충 일정 미정</span> : null}
                        {makeup.status === "scheduled" ? (
                          <span className="tabular-nums">
                            보충 예정 {formatKoreanDate(makeup.scheduled_date)}
                            {makeup.start_time ? ` ${makeup.start_time.slice(0, 5)}` : ""}
                          </span>
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
                    {lessonLog.homework_status ||
                    lessonLog.vocab_correct !== null ||
                    lessonLog.focus_level ||
                    lessonLog.participation_level ? (
                      <div className="tabular-nums text-[#564d4d]">
                        {[
                          lessonLog.homework_status
                            ? `숙제 ${homeworkStatusLabels[lessonLog.homework_status]}`
                            : null,
                          lessonLog.vocab_correct !== null && detail.vocab_total
                            ? `단어 ${lessonLog.vocab_correct}/${detail.vocab_total} (${vocabPercent(lessonLog.vocab_correct, detail.vocab_total)}%)${lessonLog.vocab_retest ? " · 재시험 필요" : ""}`
                            : null,
                          lessonLog.focus_level ? `집중 ${focusLevelLabels[lessonLog.focus_level]}` : null,
                          lessonLog.participation_level
                            ? `참여 ${participationLevelLabels[lessonLog.participation_level]}`
                            : null,
                          lessonLog.question_level
                            ? `질문 ${questionLevelLabels[lessonLog.question_level]}`
                            : null,
                          lessonLog.kindness_level
                            ? `배려 ${kindnessLevelLabels[lessonLog.kindness_level]}`
                            : null,
                          lessonLog.effort_level
                            ? `노력 ${effortLevelLabels[lessonLog.effort_level]}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
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

        {/* 단어시험 (기록이 있는 날만) */}
        {vocabRows.length > 0 ? (
          <>
            <SectionHeading>
              단어시험{detail.vocab_total ? ` · 총 ${detail.vocab_total}문제` : ""}
            </SectionHeading>
            <div className="mt-2 space-y-1">
              {vocabRows.map((lessonLog) => (
                <div
                  key={`vocab-${lessonLog.id}`}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f8f6fc] px-3 py-1.5 text-xs tabular-nums"
                >
                  <span className="w-16 truncate font-medium text-[#2d2928]">
                    {lessonLog.student?.name ?? "학생"}
                  </span>
                  <span className="text-[#564d4d]">
                    {lessonLog.vocab_correct} / {detail.vocab_total ?? "?"}
                  </span>
                  {detail.vocab_total ? (
                    <span className="text-[#54479c]">
                      {vocabPercent(lessonLog.vocab_correct!, detail.vocab_total)}%
                    </span>
                  ) : null}
                  {lessonLog.vocab_retest ? (
                    <span className="rounded-full bg-[#efe8fb] px-1.5 py-0.5 text-[10px] text-[#5d4ba5]">
                      재시험 필요
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* 학부모 전달 (기록이 있는 날만) */}
        {parentNoteRows.length > 0 ? (
          <>
            <SectionHeading>학부모 전달</SectionHeading>
            <div className="mt-2 space-y-1.5">
              {parentNoteRows.map((lessonLog) => (
                <div
                  key={`parent-${lessonLog.id}`}
                  className="rounded-xl bg-[#fff5f2] px-3 py-2 text-xs leading-5"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-[#8a5d52]">
                      {lessonLog.student?.name ?? "학생"}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        lessonLog.parent_note_status === "completed"
                          ? "bg-[#e4f4ec] text-[#3d7f64]"
                          : "bg-[#f9e7e5] text-[#a25a54]"
                      }`}
                    >
                      {lessonLog.parent_note_status === "completed" ? "전달 완료" : "전달 필요"}
                    </span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-line text-[#564d4d]">{lessonLog.parent_note}</div>
                </div>
              ))}
            </div>
          </>
        ) : null}

      </CardContent>
    </Card>
  );
}
