import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, BookOpen, PencilLine, Sparkles, Target } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, MakeupStatusBadge } from "@/components/status-badge";
import { GuardedForm } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate, formatKoreanDateFull, todayDateString } from "@/lib/dates";
import { gradeDisplay, gradeOptions } from "@/lib/grades";
import { genderLabels } from "@/lib/validation/student";
import { getCurrentUserGroups } from "@/lib/supabase/queries/groups";
import {
  getStudentLessonHistory,
  getStudentMakeups,
  summarizeAttendance,
} from "@/lib/supabase/queries/student-history";
import { getStudentByIdForCurrentUser, getStudentGroupsForCurrentUser } from "@/lib/supabase/queries/students";
import { archiveStudentAction, updateStudentAction } from "../actions";


export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, groups, studentGroups, history, makeups] = await Promise.all([
    getStudentByIdForCurrentUser(id),
    getCurrentUserGroups(),
    getStudentGroupsForCurrentUser(id),
    getStudentLessonHistory(id),
    getStudentMakeups(id),
  ]);

  if (!student) {
    notFound();
  }

  // 출결 요약은 최근 30일 기준 (오래된 결석이 계속 표시되지 않게)
  const since = addDaysStr(todayDateString(), -30);
  const attendanceSummary = summarizeAttendance(
    history.filter((item) => (item.dailyLog?.class_date ?? "") >= since),
  );
  const recentLessons = history.slice(0, 5);
  const recentComments = history
    .filter((item) => item.strengths || item.improvements)
    .slice(0, 5);
  const openMakeups = makeups.filter((makeup) => makeup.status === "required" || makeup.status === "scheduled");
  const pastMakeups = makeups.filter((makeup) => makeup.status === "completed" || makeup.status === "cancelled");

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

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학년</span>
                      <select
                        name="grade"
                        defaultValue={student.grade}
                        className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                      >
                        {gradeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">학교</span>
                      <input
                        name="school"
                        defaultValue={student.school ?? ""}
                        className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                        placeholder="학교명"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">성별</span>
                      <select
                        name="gender"
                        defaultValue={student.gender ?? ""}
                        className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
                      >
                        <option value="">성별 선택</option>
                        <option value="male">{genderLabels.male}</option>
                        <option value="female">{genderLabels.female}</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">생일</span>
                      <input
                        type="date"
                        name="birthDate"
                        defaultValue={student.birth_date ?? ""}
                        max={todayDateString()}
                        className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none"
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

                <form action={async () => {
                  "use server";
                  await archiveStudentAction(id);
                }} className="mt-3">
                  <Button type="submit" variant="outline" className="gap-2">
                    <Archive className="h-4 w-4" />
                    학생 보관
                  </Button>
                </form>
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
          </div>

          <div className="space-y-5">
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
                          <span className="text-[#655d5d]">
                            결석 {formatKoreanDate(makeup.original_class_date)} ·{" "}
                            {makeup.scheduled_date ? `보충 ${formatKoreanDate(makeup.scheduled_date)}` : "날짜 미정"}
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
