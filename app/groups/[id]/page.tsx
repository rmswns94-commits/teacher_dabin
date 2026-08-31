import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  BookMarked,
  BookOpen,
  CalendarClock,
  Check,
  CircleArrowRight,
  History,
  ListChecks,
  NotebookPen,
  NotebookTabs,
  Pencil,
  Plus,
  Trash2,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { HighlightCard } from "@/components/highlight-card";
import { PageHeader } from "@/components/page-header";
import { ScheduleSetEditor } from "@/components/schedule-set-editor";
import { TextbookFieldsEditor } from "@/components/textbook-fields-editor";
import { PendingButton } from "@/components/pending-button";
import { DailyLogStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKoreanDate } from "@/lib/dates";
import {
  getAvailableStudentsForGroup,
  getGroupByIdForCurrentUser,
  getGroupLatestProgress,
  getGroupRecentLogs,
  getGroupStudentsForCurrentUser,
} from "@/lib/supabase/queries/groups";
import { gradeDisplay, gradeOptions } from "@/lib/grades";
import { getCurrentUserMakeups } from "@/lib/supabase/queries/makeups";
import { getGroupSchedules } from "@/lib/supabase/queries/schedules";
import { formatScheduleBlock, groupSchedulesByTime } from "@/lib/schedule";
import type { PreparationItem } from "@/lib/supabase/types";
import {
  addPreparationItemAction,
  addStudentToGroupAction,
  archiveGroupAction,
  deletePreparationItemAction,
  removeStudentFromGroupAction,
  togglePreparationItemAction,
  updateGroupAction,
} from "../actions";

function cnCheckItem(completed: boolean) {
  return [
    "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition hover:bg-[#f8f3f0]",
    completed ? "text-[#7c6d69]" : "text-[#2b2323]",
  ].join(" ");
}

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { edit, saved } = (await searchParams) ?? {};
  const [group, allMembers, latestProgress, recentLogs, availableStudents, allMakeups, schedules] =
    await Promise.all([
      getGroupByIdForCurrentUser(id),
      getGroupStudentsForCurrentUser(id),
      getGroupLatestProgress(id),
      getGroupRecentLogs(id, 5),
      getAvailableStudentsForGroup(),
      getCurrentUserMakeups(),
      getGroupSchedules(id),
    ]);

  if (!group) {
    notFound();
  }

  const members = allMembers.filter((student) => !student.archived);
  const memberSet = new Set(allMembers.map((student) => student.id));
  const availableToAdd = availableStudents.filter((student) => !memberSet.has(student.id));
  const isEditMode = edit === "1";

  const preparationItems = (group.preparation_items ?? []) as PreparationItem[];
  const textbooks = (group.textbook ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const memberIds = new Set(members.map((student) => student.id));
  const hasOpenMakeupInGroup = allMakeups.some(
    (makeup) =>
      (makeup.status === "required" || makeup.status === "scheduled") &&
      makeup.student &&
      memberIds.has(makeup.student.id),
  );
  const suggestions = [
    latestProgress?.homework ? "지난 숙제 확인" : null,
    hasOpenMakeupInGroup ? "보충학생 확인" : null,
  ].filter(
    (text): text is string =>
      Boolean(text) && !preparationItems.some((item) => item.text === text),
  );

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1150px]">
        <PageHeader
          title={group.name}
          description={`${gradeDisplay[group.grade]} · 학생 ${members.length}명${group.memo ? ` · ${group.memo}` : ""}`}
          action={
            <Button variant="secondary" asChild>
              <Link href="/groups">그룹 목록</Link>
            </Button>
          }
        />

        {saved ? (
          <div className="mb-5 rounded-2xl border border-[#d8ebe0] bg-[#f0faf5] px-4 py-3 text-sm text-[#2f6d54]">
            수업 그룹 정보를 수정했어요.
          </div>
        ) : null}

        {!isEditMode ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[#564d4d]">
            <CalendarClock className="h-4 w-4 text-[#6652b9]" />
            <span className="font-medium text-[#4d3a3a]">수업 시간</span>
            {schedules.length === 0 ? (
              <span className="text-[#8a7b77]">아직 등록된 수업 시간이 없어요.</span>
            ) : (
              groupSchedulesByTime(schedules).map((block) => (
                <span key={block.key} className="rounded-full bg-[#f2edf9] px-2.5 py-1 text-xs tabular-nums text-[#4a3f6d]">
                  {formatScheduleBlock(block)}
                </span>
              ))
            )}
          </div>
        ) : null}

        {isEditMode ? (
          <Card className="mb-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[#6652b9]" />
                그룹 정보 수정
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateGroupAction.bind(null, id)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">그룹명</span>
                    <input
                      name="name"
                      defaultValue={group.name}
                      className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8]"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학년</span>
                    <select
                      name="grade"
                      defaultValue={group.grade}
                      className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                    >
                      {gradeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div>
                  <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">교재</span>
                  <TextbookFieldsEditor initialBooks={textbooks} />
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">✨ 하이라이트 메모</span>
                  <textarea
                    name="highlightMemo"
                    defaultValue={group.highlight_memo ?? ""}
                    rows={3}
                    className="w-full rounded-2xl border border-[#e8ddf3] bg-[#fbf8ff] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                    placeholder="이번 주 Unit 3 마무리 예정. 민수 단어 테스트 재확인."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">일반 메모 (수업 시간 등)</span>
                  <textarea
                    name="memo"
                    defaultValue={group.memo ?? ""}
                    rows={2}
                    className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                    placeholder="화 · 목 오후 6시"
                  />
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" asChild>
                    <Link href={`/groups/${id}`}>취소</Link>
                  </Button>
                  <PendingButton>저장</PendingButton>
                </div>
              </form>

              <div className="mt-5 border-t border-[#f0e7e2] pt-4">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-[#4d3a3a]">
                  <CalendarClock className="h-4 w-4 text-[#6652b9]" /> 수업 시간
                </div>
                <p className="mb-3 text-xs text-[#8a7b77]">수업 시간 변경은 바로 저장돼요.</p>

                <ScheduleSetEditor groupId={id} slots={schedules} />
              </div>

              <form action={archiveGroupAction.bind(null, id)} className="mt-4 border-t border-[#f0e7e2] pt-4">
                <Button type="submit" variant="ghost" size="sm" className="gap-2 text-[#8f625f]">
                  <Archive className="h-4 w-4" />
                  이 그룹 보관하기
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8b7b77]">
                  <BookOpen className="h-3.5 w-3.5 text-[#6652b9]" /> 현재 진도
                </div>
                {latestProgress ? (
                  <>
                    <div className="mt-2 text-base font-semibold text-[#2a2323]">
                      {latestProgress.default_progress || latestProgress.title || "진도 미입력"}
                    </div>
                    <div className="mt-1 text-xs text-[#8a7b77]">
                      최근 수업 {formatKoreanDate(latestProgress.class_date)}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-[#8a7b77]">아직 기록된 진도가 없어요.</div>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8b7b77]">
                  <Users className="h-3.5 w-3.5 text-[#3e7d6b]" /> 학생
                </div>
                <div className="mt-2 text-base font-semibold text-[#2a2323]">{members.length}명</div>
                <div className="mt-1 text-xs text-[#8a7b77]">{gradeDisplay[group.grade]}</div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8b7b77]">
                  <BookMarked className="h-3.5 w-3.5 text-[#a2686b]" /> 교재
                </div>
                {textbooks.length > 0 ? (
                  <>
                    <div className="mt-2 text-base font-semibold text-[#2a2323]">
                      {textbooks[0]}
                      {textbooks.length > 1 ? (
                        <span className="ml-1 text-sm font-normal text-[#8a7b77]">외 {textbooks.length - 1}권</span>
                      ) : null}
                    </div>
                    {textbooks.length > 1 ? (
                      <div className="mt-1 text-xs leading-5 text-[#8a7b77]">
                        {textbooks.slice(1).join(" · ")}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-2 text-sm text-[#8a7b77]">아직 등록된 교재가 없어요.</div>
                )}
              </Card>
            </div>

            <HighlightCard groupId={id} initialHighlight={group.highlight_memo ?? ""} />

            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-[#3e7d6b]" /> 오늘 준비
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {preparationItems.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-3 text-sm text-[#655d5d]">
                    수업 전에 챙길 것을 적어보세요.
                  </div>
                ) : (
                  <ul className="divide-y divide-dashed divide-[#f4e2e8]">
                    {preparationItems.map((item) => (
                      <li key={item.id} className="flex items-center gap-1">
                        <form action={togglePreparationItemAction.bind(null, id, item.id)} className="flex-1">
                          <button
                            type="submit"
                            className={cnCheckItem(item.completed)}
                            aria-pressed={item.completed}
                          >
                            {item.completed ? (
                              <span
                                aria-hidden
                                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#8fc7ab]"
                              >
                                <Check className="h-3 w-3 text-white" strokeWidth={3} />
                              </span>
                            ) : (
                              <span
                                aria-hidden
                                className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[#d9c8f0] bg-white"
                              />
                            )}
                            <span className={item.completed ? "line-through opacity-60" : undefined}>
                              {item.text}
                            </span>
                          </button>
                        </form>
                        <form action={deletePreparationItemAction.bind(null, id, item.id)}>
                          <button
                            type="submit"
                            aria-label={`${item.text} 삭제`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#a79996] transition hover:bg-[#fdf4f1] hover:text-[#8f625f]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {suggestions.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[#8a7b77]">추천:</span>
                    {suggestions.map((text) => (
                      <form key={text} action={addPreparationItemAction.bind(null, id)}>
                        <input type="hidden" name="text" value={text} />
                        <button
                          type="submit"
                          className="rounded-full border border-[#d8ebe0] bg-white px-2.5 py-1 text-xs text-[#3d6d58] transition hover:bg-[#f0faf5]"
                        >
                          + {text}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : null}

                <form action={addPreparationItemAction.bind(null, id)} className="flex gap-2">
                  <input
                    name="text"
                    maxLength={100}
                    placeholder="준비 항목 추가 (예: Unit 3 단어 테스트)"
                    className="flex-1 rounded-xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                    required
                  />
                  <PendingButton variant="secondary" size="sm" pendingText="추가 중..." className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> 추가
                  </PendingButton>
                </form>

                <div className="border-t border-[#f0e7e2] pt-3">
                  <Button className="gap-2" asChild>
                    <Link href={`/daily-logs/new?groupId=${group.id}`}>
                      <NotebookPen className="h-4 w-4" /> 오늘 수업 기록하기
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6d5aa8]">
                  <NotebookTabs className="h-3.5 w-3.5" /> 지난 숙제
                </div>
                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3d3450]">
                  {latestProgress?.homework || (
                    <span className="text-[#9a8db5]">지난 숙제 기록이 없어요.</span>
                  )}
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#3e7d6b]">
                  <CircleArrowRight className="h-3.5 w-3.5" /> 다음 수업
                </div>
                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-[#33473f]">
                  {latestProgress?.next_lesson_plan || (
                    <span className="text-[#9a8db5]">아직 다음 수업 계획이 없어요.</span>
                  )}
                </div>
              </Card>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-4 w-4 text-[#6652b9]" /> 최근 수업
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentLogs.length === 0 ? (
                    <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                      아직 작성된 수업 기록이 없어요.
                    </div>
                  ) : (
                    recentLogs.map((log) => (
                      <Link key={log.id} href={`/daily-logs/${log.id}`} className="block">
                        <div className="rounded-2xl border border-[#eee0dc] bg-[#fffdfb] p-3 transition hover:bg-[#faf6f3]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-[#2b2323]">
                              {formatKoreanDate(log.class_date)}
                            </span>
                            <DailyLogStatusBadge status={log.status} />
                          </div>
                          {log.title || log.lesson_content ? (
                            <div className="mt-1 text-sm text-[#564d4d]">
                              {log.title || log.lesson_content}
                            </div>
                          ) : null}
                          {log.default_progress ? (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-[#8a7b77]">
                              <BookOpen className="h-3 w-3" /> {log.default_progress}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-[#3e7d6b]" /> 학생 {members.length}명
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {members.length === 0 ? (
                    <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                      아직 이 반에 등록된 학생이 없어요.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {members.map((student) => (
                        <Link key={student.id} href={`/students/${student.id}`} className="block">
                          <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[#f0e7e2] bg-[#fffdfb] px-3 py-2 transition hover:bg-[#f7f2fb]">
                            <span className="flex items-center gap-2 text-sm font-medium text-[#2b2323]">
                              <span
                                aria-hidden
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#e8e1ff] to-[#f6dfe9] text-[10px] font-semibold text-[#4a3c52]"
                              >
                                {student.name.charAt(0)}
                              </span>
                              {student.name}
                            </span>
                            <span className="text-xs text-[#8a7b77]">
                              {gradeDisplay[student.grade]}
                              {student.school ? ` · ${student.school}` : ""}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  <details className="rounded-2xl border border-[#ece0db] bg-[#fdfaf8]">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#564d4d] [&::-webkit-details-marker]:hidden">
                      <UserRoundPlus className="h-4 w-4 text-[#6853b8]" /> 학생 관리
                    </summary>
                    <div className="space-y-3 border-t border-[#f0e7e2] p-3">
                      {availableToAdd.length === 0 ? (
                        <div className="text-xs text-[#8a7b77]">추가 가능한 학생이 없어요.</div>
                      ) : (
                        <form action={addStudentToGroupAction.bind(null, id)} className="flex gap-2">
                          <select
                            name="studentId"
                            className="flex-1 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
                            required
                          >
                            <option value="">학생 선택</option>
                            {availableToAdd.map((student) => (
                              <option key={student.id} value={student.id}>{student.name}</option>
                            ))}
                          </select>
                          <PendingButton size="sm" pendingText="추가 중..." className="gap-1">
                            <Plus className="h-3.5 w-3.5" /> 추가
                          </PendingButton>
                        </form>
                      )}

                      {members.length > 0 ? (
                        <div className="space-y-1.5">
                          {members.map((student) => (
                            <div
                              key={student.id}
                              className="flex items-center justify-between rounded-xl bg-white px-3 py-1.5 text-sm"
                            >
                              <span className="text-[#564d4d]">{student.name}</span>
                              <form action={removeStudentFromGroupAction.bind(null, id, student.id)}>
                                <button
                                  type="submit"
                                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#8f625f] transition hover:bg-[#fdf4f1]"
                                >
                                  <X className="h-3 w-3" /> 제외
                                </button>
                              </form>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 flex justify-end pb-8">
              <Button className="gap-2" asChild>
                <Link href={`/groups/${id}?edit=1`}>
                  <Pencil className="h-4 w-4" />
                  그룹 정보 수정
                </Link>
              </Button>
            </div>
          </>
        )}
        </div>
      </main>
    </AppShell>
  );
}
