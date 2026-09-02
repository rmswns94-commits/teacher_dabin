import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CircleArrowRight, NotebookTabs, PencilLine, Sparkles, Target } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, DailyLogStatusBadge, MakeupStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import {
  focusLevelLabels,
  homeworkStatusLabels,
  participationLevelLabels,
  vocabPercent,
} from "@/lib/elementary";
import { getDailyLogDetailForCurrentUser } from "@/lib/supabase/queries/daily-logs";

export default async function DailyLogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = (await searchParams) ?? {};
  const log = await getDailyLogDetailForCurrentUser(id);

  if (!log) {
    notFound();
  }

  const makeupByLessonLog = new Map(
    log.makeups.filter((makeup) => makeup.student_lesson_log_id).map((makeup) => [makeup.student_lesson_log_id, makeup]),
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title={`${formatKoreanDate(log.class_date, true)} · ${log.group?.name ?? "그룹 정보 없음"}`}
          description={log.title || "수업 일지 상세"}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" asChild>
                <Link href="/daily-logs">목록으로</Link>
              </Button>
              <Button className="gap-2" asChild>
                <Link href={`/daily-logs/${log.id}/edit`}>
                  <PencilLine className="h-4 w-4" />
                  수정하기
                </Link>
              </Button>
            </div>
          }
        />

        {saved ? (
          <div className="mb-5 rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-3 text-sm text-[#2f6d54]">
            수업 기록을 저장했어요.
          </div>
        ) : null}

        <Card className="mb-5">
          <CardContent className="grid gap-4 py-5 md:grid-cols-3">
          <div className="rounded-2xl bg-[#f8f3ef] p-3">
              <div className="text-xs uppercase tracking-[0.12em] text-[#8b7b77]">상태</div>
              <div className="mt-2">
                <DailyLogStatusBadge status={log.status} />
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f2ff] p-3">
              <div className="text-xs uppercase tracking-[0.12em] text-[#8b7b77]">수업 내용</div>
              <div className="mt-2 text-sm font-medium text-[#2a2323]">
                {log.lesson_content || "입력된 수업 내용이 없어요."}
              </div>
            </div>
            <div className="rounded-2xl bg-[#edf9f3] p-3">
              <div className="text-xs uppercase tracking-[0.12em] text-[#8b7b77]">공통 진도</div>
              <div className="mt-2 text-sm font-medium text-[#2a2323]">
                {log.default_progress || "입력된 진도가 없어요."}
              </div>
            </div>
          </CardContent>
        </Card>

        {log.homework || log.next_lesson_plan ? (
          <Card className="mb-5">
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
                  <NotebookTabs className="h-3.5 w-3.5" /> 오늘 숙제
                </div>
                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3d3450]">
                  {log.homework || "입력된 숙제가 없어요."}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
                  <CircleArrowRight className="h-3.5 w-3.5" /> 다음 수업 계획
                </div>
                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#33473f]">
                  {log.next_lesson_plan || "입력된 계획이 없어요."}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {log.memo ? (
          <Card className="mb-5">
            <CardContent className="p-4 text-sm text-[#564d4d]">
              <span className="font-semibold text-[#4d3a3a]">수업 메모</span> · {log.memo}
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-3">
          {log.lessonLogs.map((lessonLog) => {
            const makeup = makeupByLessonLog.get(lessonLog.id);

            return (
              <Card key={lessonLog.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      {lessonLog.student ? (
                        <Link href={`/students/${lessonLog.student.id}`} className="hover:underline">
                          {lessonLog.student.name}
                        </Link>
                      ) : (
                        "학생 정보 없음"
                      )}
                      <AttendanceBadge status={lessonLog.attendance} />
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lessonLog.attendance === "absent" ? (
                    <div className="rounded-2xl bg-[#fff7f5] p-3 text-sm">
                      <div className="flex items-center gap-2 text-[#8a5d52]">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span className="font-semibold">놓친 진도:</span>
                        {makeup?.missed_progress || "기록 없음"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[#655d5d]">
                        {makeup ? (
                          <>
                            <MakeupStatusBadge status={makeup.status} />
                            {makeup.status === "scheduled" ? (
                              <span>보충 예정: {formatKoreanDate(makeup.scheduled_date)}</span>
                            ) : null}
                            {makeup.status === "required" ? <span>보충 날짜 미정</span> : null}
                            {makeup.status === "completed" ? (
                              <span>
                                {formatKoreanDate(makeup.completed_date)} 보충 완료
                                {makeup.completed_progress ? ` · ${makeup.completed_progress}` : ""}
                              </span>
                            ) : null}
                            <Link href="/makeups" className="text-xs text-[#5c4ca8] hover:underline">
                              보충수업 관리
                            </Link>
                          </>
                        ) : (
                          <span>보충수업 없이 넘어가기로 했어요.</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-sm text-[#564d4d]">
                        <BookOpen className="h-3.5 w-3.5 text-[#7c6d69]" />
                        <span className="font-medium">진도:</span>
                        {lessonLog.progress || "기록 없음"}
                      </div>

                      {lessonLog.homework_status ||
                      lessonLog.vocab_correct !== null ||
                      lessonLog.focus_level ||
                      lessonLog.participation_level ? (
                        <div className="text-sm tabular-nums text-[#564d4d]">
                          {[
                            lessonLog.homework_status
                              ? `숙제 ${homeworkStatusLabels[lessonLog.homework_status]}`
                              : null,
                            lessonLog.vocab_correct !== null && log.vocab_total
                              ? `단어 ${lessonLog.vocab_correct}/${log.vocab_total} (${vocabPercent(lessonLog.vocab_correct, log.vocab_total)}%)${lessonLog.vocab_retest ? " · 재시험 필요" : ""}`
                              : null,
                            lessonLog.focus_level ? `집중 ${focusLevelLabels[lessonLog.focus_level]}` : null,
                            lessonLog.participation_level
                              ? `참여 ${participationLevelLabels[lessonLog.participation_level]}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}

                      {lessonLog.parent_note ? (
                        <div className="rounded-2xl bg-[#fff5f2] p-3 text-sm text-[#96534c]">
                          <span className="text-xs font-semibold">
                            학부모 전달{lessonLog.parent_note_status === "completed" ? " (완료)" : " 필요"}
                          </span>
                          <div className="mt-0.5">{lessonLog.parent_note}</div>
                        </div>
                      ) : null}

                      {lessonLog.strengths || lessonLog.improvements ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {lessonLog.strengths ? (
                            <div className="rounded-2xl bg-[#edf8f2] p-3 text-sm text-[#2f5d4b]">
                              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                                <Sparkles className="h-3.5 w-3.5" /> 잘한 부분
                              </div>
                              {lessonLog.strengths}
                            </div>
                          ) : null}
                          {lessonLog.improvements ? (
                            <div className="rounded-2xl bg-[#fff3ef] p-3 text-sm text-[#8a5d52]">
                              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                                <Target className="h-3.5 w-3.5" /> 보완할 부분
                              </div>
                              {lessonLog.improvements}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}

                  {lessonLog.memo ? (
                    <div className="text-xs text-[#7c6d69]">메모: {lessonLog.memo}</div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
