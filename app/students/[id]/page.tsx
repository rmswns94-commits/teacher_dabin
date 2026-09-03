import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, PencilLine, Sparkles, Target } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, MakeupStatusBadge } from "@/components/status-badge";
import { StudentDeleteButton } from "@/components/student-delete-button";
import { GuardedForm } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingButton } from "@/components/pending-button";
import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, formatKoreanDateFull, todayDateString } from "@/lib/dates";
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
import { gradeDisplay, gradeOptions, isElementaryGrade } from "@/lib/grades";
import {
  computeWeeklyGrowth,
  growthAchievedSentences,
  growthEmojis,
  growthLabels,
  scopeMakeupsToWeek,
} from "@/lib/growth";
import { genderLabels } from "@/lib/validation/student";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import {
  getStudentLessonHistory,
  getStudentMakeups,
  getStudentPraises,
  summarizeAttendance,
} from "@/lib/supabase/queries/student-history";
import { getStudentByIdForCurrentUser, getStudentGroupsForCurrentUser } from "@/lib/supabase/queries/students";
import type {
  FocusLevel,
  GrowthAchievementType,
  HomeworkStatus,
  ParticipationLevel,
  PraiseCategory,
} from "@/lib/supabase/types";
import { completeParentNoteAction, updateStudentAction } from "../actions";

// 한국 기준 주 시작(월요일). 날짜 문자열만으로 계산해 timezone 밀림이 없다.
function weekStartOf(ymd: string) {
  return addDaysStr(ymd, -((dayOfWeekOf(ymd) + 6) % 7));
}


export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = (await searchParams) ?? {};

  const today = todayDateString();
  const currentWeekStart = weekStartOf(today);
  const requestedWeek =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekStartOf(week) : currentWeekStart;
  // 미래 주는 데이터가 없으므로 이번 주까지만
  const weekStart = requestedWeek > currentWeekStart ? currentWeekStart : requestedWeek;
  const weekEnd = addDaysStr(weekStart, 6);

  // 칭찬은 (이번 달 집계 + 선택한 주) 를 덮는 기간만 조회
  const monthStart = `${today.slice(0, 7)}-01`;
  const praiseSince = weekStart < monthStart ? weekStart : monthStart;

  const [student, groups, studentGroups, history, makeups, praises] = await Promise.all([
    getStudentByIdForCurrentUser(id),
    getCurrentUserGroups(),
    getStudentGroupsForCurrentUser(id),
    getStudentLessonHistory(id),
    getStudentMakeups(id),
    getStudentPraises(id, praiseSince),
  ]);

  if (!student) {
    notFound();
  }

  // 출결 요약은 최근 30일 기준 (오래된 결석이 계속 표시되지 않게)
  const since = addDaysStr(today, -30);
  const attendanceSummary = summarizeAttendance(
    history.filter((item) => (item.dailyLog?.class_date ?? "") >= since),
  );
  const recentLessons = history.slice(0, 5);
  const recentComments = history
    .filter((item) => item.strengths || item.improvements)
    .slice(0, 5);
  const openMakeups = makeups.filter((makeup) => makeup.status === "required" || makeup.status === "scheduled");
  const pastMakeups = makeups.filter((makeup) => makeup.status === "completed" || makeup.status === "cancelled");

  const isElementary = isElementaryGrade(student.grade);
  const logDateById = new Map(
    history.filter((item) => item.dailyLog).map((item) => [item.dailyLog!.id, item.dailyLog!.class_date]),
  );
  // 칭찬 한표(comment)는 문장으로, legacy category 칭찬은 기존 라벨로 표시
  const praiseLabel = (praise: { category: string; comment: string | null }) =>
    praise.comment
      ? `💜 ${praise.comment}`
      : `⭐ ${praiseCategoryLabels[praise.category as PraiseCategory] ?? praise.category}`;

  const praisesByLog = new Map<string, string[]>();
  for (const praise of praises) {
    if (praise.daily_log_id) {
      praisesByLog.set(praise.daily_log_id, [
        ...(praisesByLog.get(praise.daily_log_id) ?? []),
        praiseLabel(praise),
      ]);
    }
  }
  const monthPraiseCount = praises.filter(
    (praise) => (praise.daily_log_id ? logDateById.get(praise.daily_log_id) ?? praise.created_at.slice(0, 10) : praise.created_at.slice(0, 10)) >= monthStart,
  ).length;

  // 단어시험 최근 결과 (데이터가 있는 기록만)
  const vocabHistory = history
    .filter((item) => item.vocab_correct !== null && (item.dailyLog?.vocab_total ?? 0) > 0)
    .slice(0, 6);

  // 학부모 전달
  const pendingParentNotes = history.filter((item) => item.parent_note_status === "pending");
  const completedParentNotes = history
    .filter((item) => item.parent_note_status === "completed")
    .slice(0, 5);

  // ---- 주간 리포트 집계 (이미 불러온 history/praises에서 deterministic 계산) ----
  const weekRecords = history
    .filter((item) => {
      const date = item.dailyLog?.class_date ?? "";
      return date >= weekStart && date <= weekEnd;
    })
    .sort((a, b) => (a.dailyLog?.class_date ?? "").localeCompare(b.dailyLog?.class_date ?? ""));
  const weekAttendance = summarizeAttendance(weekRecords);
  const weekHomework = {
    completed: weekRecords.filter((item) => item.homework_status === "completed").length,
    partial: weekRecords.filter((item) => item.homework_status === "partial").length,
    missing: weekRecords.filter((item) => item.homework_status === "missing").length,
  };
  const weekVocab = weekRecords
    .filter((item) => item.vocab_correct !== null && (item.dailyLog?.vocab_total ?? 0) > 0)
    .map((item) => vocabPercent(item.vocab_correct!, item.dailyLog!.vocab_total!));
  const countLevels = (values: (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const value of values) {
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  };
  const weekFocus = countLevels(weekRecords.map((item) => item.focus_level));
  const weekParticipation = countLevels(weekRecords.map((item) => item.participation_level));
  const weekPraiseCount = praises.filter((praise) => {
    const date = praise.daily_log_id
      ? logDateById.get(praise.daily_log_id) ?? praise.created_at.slice(0, 10)
      : praise.created_at.slice(0, 10);
    return date >= weekStart && date <= weekEnd;
  }).length;
  const weekStrengths = [
    ...new Set(weekRecords.map((item) => item.strengths?.trim()).filter(Boolean) as string[]),
  ].slice(0, 3);
  const weekChecks = [
    ...new Set(weekRecords.map((item) => item.improvements?.trim()).filter(Boolean) as string[]),
  ].slice(0, 3);
  if (weekRecords.some((item) => item.vocab_retest)) weekChecks.push("단어 재시험 필요");
  if (weekHomework.missing > 0) weekChecks.push("숙제 확인 필요");
  if (openMakeups.length > 0) weekChecks.push("보충 일정 확인");
  if (pendingParentNotes.length > 0) weekChecks.push("학부모 전달 확인");
  const prevWeek = addDaysStr(weekStart, -7);
  const nextWeek = addDaysStr(weekStart, 7);

  // ---- 이번 주 성장 성취 자동 판정 (Teacher가 왕을 고르지 않음 — 관찰값 기반 rule) ----
  const weeklyGrowth = computeWeeklyGrowth({
    weekRecords: weekRecords.map((item) => ({
      attendance: item.attendance,
      homeworkStatus: item.homework_status,
      focusLevel: item.focus_level,
      participationLevel: item.participation_level,
      questionLevel: item.question_level,
      kindnessLevel: item.kindness_level,
      effortLevel: item.effort_level,
    })),
    // 단어시험 추이는 전체 최근 기록 기준 (오래된 → 최신)
    recentVocabPercents: history
      .filter((item) => item.vocab_correct !== null && (item.dailyLog?.vocab_total ?? 0) > 0)
      .sort((a, b) => (a.dailyLog?.class_date ?? "").localeCompare(b.dailyLog?.class_date ?? ""))
      .map((item) => vocabPercent(item.vocab_correct!, item.dailyLog!.vocab_total!)!),
    // 틈새왕: 이미 불러온 보충 기록에서 선택 주에 귀속되는 것만
    weekMakeups: scopeMakeupsToWeek(makeups, weekStart, weekEnd),
  });

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <PageHeader
          title={student.name}
          description={[
            gradeDisplay[student.grade as keyof typeof gradeDisplay],
            student.gender ? genderLabels[student.gender] : "",
            student.school || "학교 미입력",
            student.birth_date ? `🎂 ${formatKoreanDateFull(student.birth_date)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          action={
            <Button variant="secondary" asChild>
              <Link href="/students">목록으로</Link>
            </Button>
          }
        />

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>기본 정보</CardTitle>
              </CardHeader>
              <CardContent>
                <GuardedForm action={async (formData: FormData) => {
                  "use server";
                  await updateStudentAction(id, formData);
                }} className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학생 이름</span>
                    <input
                      name="name"
                      defaultValue={student.name}
                      className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                      required
                    />
                  </label>

                  {/* min-w-0: iPad Safari date input intrinsic width가 옆 칸을 침범하지 않게 */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block min-w-0">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학년</span>
                      <select
                        name="grade"
                        defaultValue={student.grade}
                        className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                      >
                        {gradeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학교</span>
                      <input
                        name="school"
                        defaultValue={student.school ?? ""}
                        className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                        placeholder="학교명"
                      />
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">성별</span>
                      <select
                        name="gender"
                        defaultValue={student.gender ?? ""}
                        className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                      >
                        <option value="">성별 선택</option>
                        <option value="male">{genderLabels.male}</option>
                        <option value="female">{genderLabels.female}</option>
                      </select>
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">생일</span>
                      <input
                        type="date"
                        name="birthDate"
                        defaultValue={student.birth_date ?? ""}
                        max={todayDateString()}
                        className="w-full min-w-0 max-w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 그룹</span>
                    <select
                      name="groupId"
                      defaultValue={studentGroups[0]?.id ?? ""}
                      className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                    >
                      <option value="">그룹 선택</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">메모</span>
                    <textarea
                      name="memo"
                      rows={4}
                      defaultValue={student.memo ?? ""}
                      className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                    />
                  </label>

                  <div className="flex gap-2">
                    <Button type="submit" className="gap-2">
                      <PencilLine className="h-4 w-4" />
                      수정하기
                    </Button>
                  </div>
                </GuardedForm>

                <div className="mt-3">
                  <StudentDeleteButton studentId={id} studentName={student.name} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>최근 수업</CardTitle>
                  {attendanceSummary.total > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs" title="최근 30일 출결">
                      <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[#3d7f64]">
                        출석 {attendanceSummary.present}
                      </span>
                      <span className="rounded-full bg-[#fdf3e4] px-2 py-1 text-[#94702f]">
                        지각 {attendanceSummary.late}
                      </span>
                      <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[#a26660]">
                        결석 {attendanceSummary.absent}
                      </span>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentLessons.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#564d4d]">
                    아직 작성된 수업 기록이 없어요.
                  </div>
                ) : (
                  recentLessons.map((lesson) => (
                    <Link
                      key={lesson.id}
                      href={lesson.dailyLog ? `/daily-logs/${lesson.dailyLog.id}` : "/daily-logs"}
                      className="block"
                    >
                      <div className="rounded-2xl border border-[#eee0dc] bg-[#fffdfb] p-3 transition hover:bg-[#faf6f3]">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-[#2b2323]">
                            {formatKoreanDate(lesson.dailyLog?.class_date)}
                          </span>
                          {lesson.dailyLog?.group ? (
                            <span className="text-xs text-[#786d6b]">{lesson.dailyLog.group.name}</span>
                          ) : null}
                          <AttendanceBadge status={lesson.attendance} />
                        </div>
                        {lesson.progress ? (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#564d4d]">
                            <BookOpen className="h-3 w-3 text-[#7c6d69]" /> {lesson.progress}
                          </div>
                        ) : null}
                        {lesson.homework_status ||
                        lesson.vocab_correct !== null ||
                        lesson.focus_level ||
                        lesson.participation_level ? (
                          <div className="mt-1 text-xs tabular-nums text-[#564d4d]">
                            {[
                              lesson.homework_status
                                ? `숙제 ${homeworkStatusLabels[lesson.homework_status as HomeworkStatus]}`
                                : null,
                              lesson.vocab_correct !== null && lesson.dailyLog?.vocab_total
                                ? `단어 ${lesson.vocab_correct}/${lesson.dailyLog.vocab_total} (${vocabPercent(lesson.vocab_correct, lesson.dailyLog.vocab_total)}%)${lesson.vocab_retest ? " · 재시험 필요" : ""}`
                                : null,
                              lesson.focus_level
                                ? `집중 ${focusLevelLabels[lesson.focus_level as FocusLevel]}`
                                : null,
                              lesson.participation_level
                                ? `참여 ${participationLevelLabels[lesson.participation_level as ParticipationLevel]}`
                                : null,
                              lesson.question_level
                                ? `질문 ${questionLevelLabels[lesson.question_level]}`
                                : null,
                              lesson.kindness_level
                                ? `배려 ${kindnessLevelLabels[lesson.kindness_level]}`
                                : null,
                              lesson.effort_level
                                ? `노력 ${effortLevelLabels[lesson.effort_level]}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                        {lesson.dailyLog && (praisesByLog.get(lesson.dailyLog.id) ?? []).length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(praisesByLog.get(lesson.dailyLog.id) ?? []).map((label, praiseIndex) => (
                              <span
                                key={`${label}-${praiseIndex}`}
                                className="rounded-full bg-[#fdf3e4] px-1.5 py-0.5 text-[10px] text-[#8a6828]"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {lesson.parent_note ? (
                          <div className="mt-1 text-xs text-[#96534c]">
                            학부모 전달{lesson.parent_note_status === "completed" ? " (완료)" : ""} ·{" "}
                            {lesson.parent_note}
                          </div>
                        ) : null}
                        {lesson.strengths ? (
                          <div className="mt-1 text-xs text-[#3d6d58]">잘한 점 · {lesson.strengths}</div>
                        ) : null}
                        {lesson.improvements ? (
                          <div className="mt-1 text-xs text-[#8a5d52]">보완 · {lesson.improvements}</div>
                        ) : null}
                        {lesson.memo ? (
                          <div className="mt-1 text-xs text-[#7c6d69]">메모 · {lesson.memo}</div>
                        ) : null}
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {recentComments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>최근 코멘트</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2f5d4b]">
                      <Sparkles className="h-3.5 w-3.5" /> 잘한 부분
                    </div>
                    {recentComments.filter((item) => item.strengths).length === 0 ? (
                      <div className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">기록이 없어요.</div>
                    ) : (
                      recentComments
                        .filter((item) => item.strengths)
                        .map((item) => (
                          <div key={`s-${item.id}`} className="rounded-2xl bg-[#edf8f2] p-3 text-xs text-[#2f5d4b]">
                            <span className="font-medium">{formatKoreanDate(item.dailyLog?.class_date)}</span> ·{" "}
                            {item.strengths}
                          </div>
                        ))
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8a5d52]">
                      <Target className="h-3.5 w-3.5" /> 보완할 부분
                    </div>
                    {recentComments.filter((item) => item.improvements).length === 0 ? (
                      <div className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">기록이 없어요.</div>
                    ) : (
                      recentComments
                        .filter((item) => item.improvements)
                        .map((item) => (
                          <div key={`i-${item.id}`} className="rounded-2xl bg-[#fff3ef] p-3 text-xs text-[#8a5d52]">
                            <span className="font-medium">{formatKoreanDate(item.dailyLog?.class_date)}</span> ·{" "}
                            {item.improvements}
                          </div>
                        ))
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>주간 리포트</CardTitle>
                  <div className="flex items-center gap-1 text-xs">
                    <Link
                      href={`/students/${id}?week=${prevWeek}`}
                      className="rounded-lg px-2 py-1 text-[#6b6b74] transition hover:bg-[#f4f4f6]"
                    >
                      ← 이전 주
                    </Link>
                    <span className="tabular-nums font-medium text-[#33333b]">
                      {formatKoreanDate(weekStart)} ~ {formatKoreanDate(weekEnd)}
                    </span>
                    {weekStart < currentWeekStart ? (
                      <Link
                        href={`/students/${id}?week=${nextWeek}`}
                        className="rounded-lg px-2 py-1 text-[#6b6b74] transition hover:bg-[#f4f4f6]"
                      >
                        다음 주 →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {weekRecords.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                    이 주에는 수업 기록이 없어요.
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-2xl bg-[#edf9f3] p-3 text-center">
                        <div className="text-[11px] text-[#3d7f64]">출석</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-[#2f6d54]">
                          {weekAttendance.present + weekAttendance.late} / {weekAttendance.total}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#fdf3e4] p-3 text-center">
                        <div className="text-[11px] text-[#94702f]">숙제 완료</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-[#8a6828]">
                          {weekHomework.completed} /{" "}
                          {weekHomework.completed + weekHomework.partial + weekHomework.missing}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#f0ecfb] p-3 text-center">
                        <div className="text-[11px] text-[#54479c]">단어시험</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-[#54479c]">
                          {weekVocab.length > 0 ? weekVocab.map((p) => `${p}`).join(" → ") : "-"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#fdf8ec] p-3 text-center">
                        <div className="text-[11px] text-[#8a6828]">칭찬</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-[#8a6828]">
                          ⭐ {weekPraiseCount}
                        </div>
                      </div>
                    </div>

                    {weekFocus.size > 0 || weekParticipation.size > 0 ? (
                      <div className="text-xs text-[#564d4d]">
                        {[
                          ...[...weekFocus.entries()].map(
                            ([level, count]) =>
                              `집중 ${focusLevelLabels[level as FocusLevel]} ${count}회`,
                          ),
                          ...[...weekParticipation.entries()].map(
                            ([level, count]) =>
                              `참여 ${participationLevelLabels[level as ParticipationLevel]} ${count}회`,
                          ),
                        ].join(" · ")}
                      </div>
                    ) : null}

                    {weeklyGrowth.achieved.length > 0 ? (
                      <div className="rounded-2xl bg-[#e9f6ef] p-3">
                        <div className="text-xs font-semibold text-[#2f6d54]">이번 주 성장 🌱</div>
                        <ul className="mt-1 space-y-0.5 text-xs leading-5 text-[#2f6d54]">
                          {weeklyGrowth.achieved.map((type) => (
                            <li key={type}>
                              {growthEmojis[type]}{" "}
                              <span className="font-semibold">{growthLabels[type]}</span> ·{" "}
                              {growthAchievedSentences[type]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {weeklyGrowth.vocabTrend ? (
                      <div className="rounded-2xl bg-[#f0ecfb] p-3 text-xs text-[#54479c]">
                        📝 단어 성장 · {weeklyGrowth.vocabTrend.from}점 →{" "}
                        {weeklyGrowth.vocabTrend.to}점 ({weeklyGrowth.vocabTrend.rise}점 성장했어요!)
                      </div>
                    ) : null}
                    {Object.entries(weeklyGrowth.stats).some(
                      ([, stat]) => (stat?.evaluated ?? 0) > 0,
                    ) ? (
                      <div className="text-xs text-[#8a7b77]">
                        이번 주 관찰:{" "}
                        {Object.entries(weeklyGrowth.stats)
                          .filter(([, stat]) => (stat?.evaluated ?? 0) > 0)
                          .map(
                            ([type, stat]) =>
                              `${growthLabels[type as GrowthAchievementType]} ${stat!.positive}/${stat!.evaluated}`,
                          )
                          .join(" · ")}
                      </div>
                    ) : null}

                    {weekStrengths.length > 0 ? (
                      <div className="rounded-2xl bg-[#edf8f2] p-3">
                        <div className="text-xs font-semibold text-[#2f5d4b]">잘한 점</div>
                        <ul className="mt-1 space-y-0.5 text-xs leading-5 text-[#2f5d4b]">
                          {weekStrengths.map((text) => (
                            <li key={text}>• {text}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {weekChecks.length > 0 ? (
                      <div className="rounded-2xl bg-[#fff3ef] p-3">
                        <div className="text-xs font-semibold text-[#8a5d52]">다음 주 체크</div>
                        <ul className="mt-1 space-y-0.5 text-xs leading-5 text-[#8a5d52]">
                          {[...new Set(weekChecks)].map((text) => (
                            <li key={text}>• {text}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            {pendingParentNotes.length > 0 || completedParentNotes.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>학부모 전달</CardTitle>
                    {pendingParentNotes.length > 0 ? (
                      <span className="rounded-full bg-[#fff0ef] px-2.5 py-1 text-[11px] font-medium text-[#a26660]">
                        전달 필요 {pendingParentNotes.length}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingParentNotes.length === 0 ? (
                    <div className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">
                      전달할 내용이 없어요.
                    </div>
                  ) : (
                    pendingParentNotes.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[#f0ddd8] bg-[#fff9f7] p-3 text-xs"
                      >
                        <div className="font-medium text-[#8a5d52]">
                          {formatKoreanDate(item.dailyLog?.class_date)}
                        </div>
                        <div className="mt-1 leading-5 text-[#564d4d]">{item.parent_note}</div>
                        <form action={completeParentNoteAction.bind(null, item.id, id)} className="mt-2">
                          <PendingButton variant="secondary" size="sm" pendingText="처리 중...">
                            전달 완료
                          </PendingButton>
                        </form>
                      </div>
                    ))
                  )}
                  {completedParentNotes.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-[#8a8a93]">
                        전달 완료 기록 {completedParentNotes.length}건 보기
                      </summary>
                      <div className="mt-2 space-y-2">
                        {completedParentNotes.map((item) => (
                          <div key={item.id} className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">
                            {formatKoreanDate(item.dailyLog?.class_date)} · {item.parent_note}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {isElementary || vocabHistory.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>단어시험</CardTitle>
                </CardHeader>
                <CardContent>
                  {vocabHistory.length === 0 ? (
                    <div className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">
                      아직 단어시험 기록이 없어요.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {vocabHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl bg-[#f8f6fc] px-3 py-2 text-xs tabular-nums"
                        >
                          <span className="text-[#564d4d]">
                            {formatKoreanDate(item.dailyLog?.class_date)}
                          </span>
                          <span className="font-medium text-[#33333b]">
                            {item.vocab_correct} / {item.dailyLog?.vocab_total}
                          </span>
                          <span className="text-[#54479c]">
                            {vocabPercent(item.vocab_correct!, item.dailyLog!.vocab_total!)}%
                            {item.vocab_retest ? " · 재시험" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {isElementary || praises.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>칭찬 기록</CardTitle>
                    <span className="rounded-full bg-[#fdf8ec] px-2.5 py-1 text-[11px] font-medium text-[#8a6828]">
                      이번 달 ⭐ {monthPraiseCount}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {praises.length === 0 ? (
                    <div className="rounded-2xl bg-[#f8f3ef] p-3 text-xs text-[#655d5d]">
                      수업일지에서 ⭐ 칭찬을 기록하면 여기에 모여요.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {praises.slice(0, 6).map((praise) => (
                        <div key={praise.id} className="flex items-start gap-2 text-xs text-[#564d4d]">
                          <span className="tabular-nums text-[#8a8a93]">
                            {formatKoreanDate(
                              praise.daily_log_id
                                ? logDateById.get(praise.daily_log_id) ?? praise.created_at.slice(0, 10)
                                : praise.created_at.slice(0, 10),
                            )}
                          </span>
                          <span className="min-w-0">{praiseLabel(praise)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>소속 수업 그룹</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {studentGroups.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                    현재 등록된 수업 그룹이 없습니다.
                  </div>
                ) : (
                  studentGroups.map((group) => (
                    <div key={group.id} className="rounded-2xl border border-[#eee0dc] bg-[#fffdfb] p-3">
                      <div className="font-medium text-[#2b2323]">{group.name}</div>
                      <div className="mt-1 text-xs text-[#786d6b]">
                        {gradeDisplay[group.grade as keyof typeof gradeDisplay]}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>보충수업</CardTitle>
                  {openMakeups.length > 0 ? (
                    <span className="rounded-full bg-[#fff0ef] px-2.5 py-1 text-[11px] font-medium text-[#a26660]">
                      보충 필요 {openMakeups.length}건
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {makeups.length === 0 ? (
                  <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm text-[#655d5d]">
                    보충수업 기록이 없어요.
                  </div>
                ) : (
                  <>
                    {openMakeups.map((makeup) => (
                      <div key={makeup.id} className="rounded-2xl border border-[#f0ddd8] bg-[#fff9f7] p-3 text-xs">
                        <div className="flex items-center gap-2">
                          <MakeupStatusBadge status={makeup.status} />
                          <span className="tabular-nums text-[#655d5d]">
                            결석 {formatKoreanDate(makeup.original_class_date)} ·{" "}
                            {makeup.scheduled_date
                              ? `보충 ${formatKoreanDate(makeup.scheduled_date)}${
                                  makeup.start_time ? ` ${makeup.start_time.slice(0, 5)}` : ""
                                }`
                              : "일정 미정"}
                          </span>
                        </div>
                        {makeup.missed_progress ? (
                          <div className="mt-1.5 text-[#564d4d]">놓친 진도: {makeup.missed_progress}</div>
                        ) : null}
                      </div>
                    ))}
                    {pastMakeups.map((makeup) => (
                      <div key={makeup.id} className="rounded-2xl border border-[#eee0dc] bg-[#fffdfb] p-3 text-xs">
                        <div className="flex items-center gap-2">
                          <MakeupStatusBadge status={makeup.status} />
                          <span className="text-[#655d5d]">
                            결석 {formatKoreanDate(makeup.original_class_date)}
                            {makeup.status === "completed"
                              ? ` · ${formatKoreanDate(makeup.completed_date)} 완료`
                              : ""}
                          </span>
                        </div>
                        {makeup.status === "completed" && makeup.completed_progress ? (
                          <div className="mt-1.5 text-[#564d4d]">보충한 진도: {makeup.completed_progress}</div>
                        ) : null}
                      </div>
                    ))}
                    <Link href="/makeups" className="block pt-1 text-xs text-[#5c4ca8] hover:underline">
                      보충수업 관리로 이동
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>학생 메모</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl bg-[#f8f3ef] p-4 text-sm leading-6 text-[#564d4d]">
                  {student.memo || "등록된 메모가 아직 없어요."}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
