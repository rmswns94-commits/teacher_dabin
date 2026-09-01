"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  BookOpen,
  CalendarCheck,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CircleArrowRight,
  CircleCheck,
  CircleX,
  Clock3,
  NotebookPen,
  NotebookTabs,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MakeupStatusBadge } from "@/components/status-badge";
import { saveDailyLogAction } from "@/app/daily-logs/actions";
import { improvementPresets, strengthPresets } from "@/lib/constants/lesson-comments";
import { formatKoreanDate } from "@/lib/dates";
import { gradeDisplay } from "@/lib/grades";
import type { AttendanceStatus, StudentGrade } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export type DailyLogFormStudent = {
  studentId: string;
  name: string;
  grade: StudentGrade;
  entry?: {
    attendance: AttendanceStatus;
    progress: string;
    strengths: string;
    improvements: string;
    memo: string;
  };
  makeup?: {
    status: "required" | "scheduled" | "completed" | "cancelled";
    scheduledDate: string;
    missedProgress: string;
  } | null;
};

type EntryState = {
  attendance: AttendanceStatus;
  progress: string;
  strengths: string;
  improvements: string;
  memo: string;
  missedProgress: string;
  needsMakeup: boolean;
  makeupScheduledDate: string;
  makeupCompleted: boolean;
};

function initEntry(student: DailyLogFormStudent): EntryState {
  const makeup = student.makeup ?? null;
  const makeupOpen = makeup?.status === "required" || makeup?.status === "scheduled";

  return {
    attendance: student.entry?.attendance ?? "present",
    progress: student.entry?.progress ?? "",
    strengths: student.entry?.strengths ?? "",
    improvements: student.entry?.improvements ?? "",
    memo: student.entry?.memo ?? "",
    missedProgress: makeup?.missedProgress ?? "",
    needsMakeup: makeupOpen || makeup?.status === "completed",
    makeupScheduledDate: makeupOpen ? makeup?.scheduledDate ?? "" : "",
    makeupCompleted: makeup?.status === "completed",
  };
}

export function DailyLogForm({
  dailyLogId,
  classDate: initialClassDate,
  group,
  students,
  initial,
}: {
  dailyLogId?: string;
  classDate: string;
  group: { id: string; name: string };
  students: DailyLogFormStudent[];
  initial?: {
    title: string;
    lessonContent: string;
    defaultProgress: string;
    memo: string;
    homework: string;
    nextLessonPlan: string;
  };
}) {
  const [classDate, setClassDate] = useState(initialClassDate);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [lessonContent, setLessonContent] = useState(initial?.lessonContent ?? "");
  const [defaultProgress, setDefaultProgress] = useState(initial?.defaultProgress ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [homework, setHomework] = useState(initial?.homework ?? "");
  const [nextLessonPlan, setNextLessonPlan] = useState(initial?.nextLessonPlan ?? "");
  const [showSummary, setShowSummary] = useState(false);
  const [entries, setEntries] = useState<Record<string, EntryState>>(() =>
    Object.fromEntries(students.map((student) => [student.studentId, initEntry(student)])),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      students.map((student) => [
        student.studentId,
        Boolean(student.entry?.strengths || student.entry?.improvements || student.entry?.memo),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const updateEntry = (studentId: string, patch: Partial<EntryState>) => {
    setEntries((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  };

  const applyDefaultProgress = () => {
    if (!defaultProgress.trim()) {
      return;
    }

    setEntries((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([studentId, entry]) => [
          studentId,
          entry.attendance === "absent"
            ? { ...entry, missedProgress: entry.missedProgress || defaultProgress.trim() }
            : { ...entry, progress: defaultProgress.trim() },
        ]),
      ),
    );
  };

  const appendPreset = (studentId: string, field: "strengths" | "improvements", preset: string) => {
    const current = entries[studentId][field];

    // 같은 quick comment를 두 번 눌러도 문장이 반복되지 않게 한다.
    if (current.includes(preset)) {
      return;
    }

    updateEntry(studentId, { [field]: current ? `${current.trimEnd()} ${preset}` : preset });
  };

  const save = (status: "draft" | "completed") => {
    setError("");
    startTransition(async () => {
      const result = await saveDailyLogAction({
        dailyLogId,
        classDate,
        groupId: group.id,
        title,
        lessonContent,
        defaultProgress,
        memo,
        homework,
        nextLessonPlan,
        status,
        students: students.map((student) => {
          const entry = entries[student.studentId];
          return {
            studentId: student.studentId,
            attendance: entry.attendance,
            progress: entry.progress,
            strengths: entry.strengths,
            improvements: entry.improvements,
            memo: entry.memo,
            missedProgress: entry.missedProgress,
            needsMakeup: entry.needsMakeup,
            makeupScheduledDate: entry.makeupScheduledDate,
          };
        }),
      });

      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-[#6652b9]" />
            수업 기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">날짜</span>
              <input
                type="date"
                value={classDate}
                onChange={(event) => setClassDate(event.target.value)}
                className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8]"
                required
              />
            </label>

            <div className="block">
              <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 그룹</span>
              <div className="flex items-center justify-between rounded-2xl border border-[#ece0db] bg-[#f8f3ef] px-3 py-2.5 text-sm text-[#2b2323]">
                <span className="font-medium">{group.name}</span>
                {!dailyLogId ? (
                  <Link href="/daily-logs/new" className="text-xs text-[#5c4ca8] hover:underline">
                    변경
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 제목 (선택)</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="Unit 3 본문 독해"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 내용 (선택)</span>
            <textarea
              value={lessonContent}
              onChange={(event) => setLessonContent(event.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="Unit 3 본문 독해 + 관계대명사 복습"
            />
          </label>

          <div className="rounded-2xl bg-[#f5f2ff] p-3">
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <BookOpen className="h-3.5 w-3.5" /> 공통 진도
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={defaultProgress}
                  onChange={(event) => setDefaultProgress(event.target.value)}
                  className="flex-1 rounded-2xl border border-[#e2d8f3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                  placeholder="교과서 p.48~53"
                />
                <Button type="button" variant="secondary" onClick={applyDefaultProgress}>
                  전체 학생에게 적용
                </Button>
              </div>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <NotebookTabs className="h-3.5 w-3.5 text-[#6652b9]" /> 오늘 숙제
              </span>
              <textarea
                value={homework}
                onChange={(event) => setHomework(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                placeholder={"Workbook p.24~27 / Unit 3 단어 1~30"}
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#4d3a3a]">
                <CircleArrowRight className="h-3.5 w-3.5 text-[#3e7d6b]" /> 다음 수업 계획
              </span>
              <textarea
                value={nextLessonPlan}
                onChange={(event) => setNextLessonPlan(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
                placeholder={"Unit 3 p.54~59 / 관계대명사 목적격 복습"}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4d3a3a]">수업 메모 (선택)</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-[#ece0db] bg-[#fffdfb] px-3 py-2.5 text-sm outline-none focus:border-[#c9b9e8] placeholder:text-[#a79996]"
              placeholder="다음 시간 Unit 3 Workbook 진행"
            />
          </label>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {students.map((student) => {
          const entry = entries[student.studentId];
          const isAbsent = entry.attendance === "absent";
          const isExpanded = expanded[student.studentId];

          return (
            <Card key={student.studentId} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8e1ff] to-[#f6dfe9] text-xs font-semibold text-[#4a3c52]"
                  >
                    {student.name.charAt(0)}
                  </span>
                  <span className="font-semibold text-[#2b2323]">{student.name}</span>
                  <span className="rounded-full bg-[#f2effc] px-2 py-0.5 text-[10px] text-[#5f54b8]">
                    {gradeDisplay[student.grade]}
                  </span>
                </div>

                <div className="flex gap-1.5" role="group" aria-label={`${student.name} 출결`}>
                  <button
                    type="button"
                    onClick={() => updateEntry(student.studentId, { attendance: "present" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "present"
                        ? "border-[#bfe3d2] bg-[#edf9f3] text-[#2f6d54]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <CircleCheck className="h-3.5 w-3.5" /> 출석
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEntry(student.studentId, { attendance: "late" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "late"
                        ? "border-[#ecd9b4] bg-[#fdf3e4] text-[#8a6828]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <Clock3 className="h-3.5 w-3.5" /> 지각
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEntry(student.studentId, { attendance: "absent" })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                      entry.attendance === "absent"
                        ? "border-[#f0ccc7] bg-[#fff0ef] text-[#96534c]"
                        : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                    )}
                  >
                    <CircleX className="h-3.5 w-3.5" /> 결석
                  </button>
                </div>
              </div>

              {isAbsent ? (
                <div className="mt-3 space-y-3 rounded-2xl bg-[#fff7f5] p-3">
                  <div className="text-xs text-[#96837e]">
                    놓친 수업 · {formatKoreanDate(classDate)} · {group.name}
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#8a5d52]">놓친 진도</span>
                    <input
                      value={entry.missedProgress}
                      onChange={(event) => updateEntry(student.studentId, { missedProgress: event.target.value })}
                      className="w-full rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4] placeholder:text-[#b5a29e]"
                      placeholder={defaultProgress.trim() ? `공통 진도: ${defaultProgress.trim()}` : "놓친 진도를 입력해주세요"}
                    />
                    <span className="mt-1 block text-[11px] text-[#a68e88]">
                      {entry.missedProgress && entry.missedProgress === defaultProgress.trim()
                        ? "수업일지의 진도를 자동으로 가져왔어요. 필요하면 수정할 수 있어요."
                        : !entry.missedProgress
                          ? defaultProgress.trim()
                            ? "비워두면 저장할 때 공통 진도가 자동으로 들어가요."
                            : "수업 진도가 아직 입력되지 않았어요. 직접 입력할 수 있어요."
                          : null}
                    </span>
                  </label>

                  {entry.makeupCompleted ? (
                    <div className="flex items-center gap-2 text-xs text-[#655d5d]">
                      <MakeupStatusBadge status="completed" />
                      이미 완료된 보충수업이 연결되어 있어요. 보충 기록은 보충수업 페이지에서 확인할 수 있어요.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#8a5d52]">보충수업</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              // 보충 필요 체크 시 수업일지의 공통 진도를 놓친 진도로 자동 입력.
                              // 사용자가 이미 적어둔 값은 덮어쓰지 않는다.
                              updateEntry(student.studentId, {
                                needsMakeup: true,
                                missedProgress: entry.missedProgress || defaultProgress.trim(),
                              })
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                              entry.needsMakeup
                                ? "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                                : "border-[#ece0db] bg-white text-[#7c6d69]",
                            )}
                          >
                            <CalendarCheck className="h-3 w-3" /> 보충 필요
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEntry(student.studentId, { needsMakeup: false, makeupScheduledDate: "" })}
                            className={cn(
                              "rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                              !entry.needsMakeup
                                ? "border-[#d9cec9] bg-[#f6f1ee] text-[#655a56]"
                                : "border-[#ece0db] bg-white text-[#7c6d69]",
                            )}
                          >
                            보충 불필요
                          </button>
                        </div>
                      </div>

                      {entry.needsMakeup ? (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-[#8a5d52]">
                            보충 예정일 (미정이면 비워두세요)
                          </span>
                          <input
                            type="date"
                            value={entry.makeupScheduledDate}
                            onChange={(event) =>
                              updateEntry(student.studentId, { makeupScheduledDate: event.target.value })
                            }
                            className="rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4]"
                          />
                        </label>
                      ) : null}
                    </>
                  )}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#7c6d69]">추가 메모</span>
                    <input
                      value={entry.memo}
                      onChange={(event) => updateEntry(student.studentId, { memo: event.target.value })}
                      className="w-full rounded-xl border border-[#f0ddd8] bg-white px-3 py-2 text-sm outline-none focus:border-[#e3bcb4]"
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="flex flex-1 items-center gap-2 rounded-xl border border-[#efe4dd] bg-[#fdfaf8] px-3 py-2">
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#7c6d69]" />
                      <input
                        value={entry.progress}
                        onChange={(event) => updateEntry(student.studentId, { progress: event.target.value })}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-[#a79996]"
                        placeholder="진도"
                        aria-label={`${student.name} 진도`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [student.studentId]: !prev[student.studentId] }))
                      }
                      className="flex items-center justify-center gap-1 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-xs font-medium text-[#564d4d] transition hover:bg-[#faf6f3]"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      코멘트 {isExpanded ? "접기" : "입력"}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-[#edf8f2] p-3">
                        <div className="mb-2 text-xs font-semibold text-[#2f5d4b]">잘한 부분</div>
                        <textarea
                          value={entry.strengths}
                          onChange={(event) => updateEntry(student.studentId, { strengths: event.target.value })}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-[#dfeee6] bg-white px-3 py-2 text-sm outline-none focus:border-[#bcdccb]"
                          aria-label={`${student.name} 잘한 부분`}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {strengthPresets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => appendPreset(student.studentId, "strengths", preset)}
                              className="rounded-full border border-[#d8ebe0] bg-white px-2 py-0.5 text-[11px] text-[#3d6d58] transition hover:bg-[#f0faf5]"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#fff3ef] p-3">
                        <div className="mb-2 text-xs font-semibold text-[#8a5d52]">보완할 부분</div>
                        <textarea
                          value={entry.improvements}
                          onChange={(event) => updateEntry(student.studentId, { improvements: event.target.value })}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-[#f5e3df] bg-white px-3 py-2 text-sm outline-none focus:border-[#eccec7]"
                          aria-label={`${student.name} 보완할 부분`}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {improvementPresets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => appendPreset(student.studentId, "improvements", preset)}
                              className="rounded-full border border-[#f2ded8] bg-white px-2 py-0.5 text-[11px] text-[#8a5d52] transition hover:bg-[#fdf4f1]"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-xs font-semibold text-[#7c6d69]">추가 메모</span>
                        <input
                          value={entry.memo}
                          onChange={(event) => updateEntry(student.studentId, { memo: event.target.value })}
                          className="w-full rounded-xl border border-[#efe4dd] bg-white px-3 py-2 text-sm outline-none focus:border-[#dcc9c0]"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] px-4 py-3 text-sm text-[#7f5d57]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pb-8">
        <Button type="button" variant="secondary" disabled={isPending} onClick={() => save("draft")}>
          {isPending ? "저장 중..." : "임시 저장"}
        </Button>
        <Button type="button" disabled={isPending} onClick={() => setShowSummary(true)} className="gap-2">
          <CheckCheck className="h-4 w-4" />
          수업 기록 완료
        </Button>
        <span className="text-xs text-[#8a7b77]">
          임시 저장한 일지는 목록에서 &quot;작성 중&quot;으로 표시돼요.
        </span>
      </div>

      {showSummary ? (
        <CompletionSummary
          groupName={group.name}
          defaultProgress={defaultProgress}
          homework={homework}
          nextLessonPlan={nextLessonPlan}
          students={students}
          entries={entries}
          isPending={isPending}
          onBack={() => setShowSummary(false)}
          onComplete={() => save("completed")}
        />
      ) : null}
    </div>
  );
}

function CompletionSummary({
  groupName,
  defaultProgress,
  homework,
  nextLessonPlan,
  students,
  entries,
  isPending,
  onBack,
  onComplete,
}: {
  groupName: string;
  defaultProgress: string;
  homework: string;
  nextLessonPlan: string;
  students: DailyLogFormStudent[];
  entries: Record<string, EntryState>;
  isPending: boolean;
  onBack: () => void;
  onComplete: () => void;
}) {
  const counts = { present: 0, late: 0, absent: 0 };
  const makeupNames: string[] = [];

  for (const student of students) {
    const entry = entries[student.studentId];
    counts[entry.attendance] += 1;

    if (entry.attendance === "absent" && entry.needsMakeup) {
      makeupNames.push(student.name);
    }
  }

  const reminders = [
    !homework.trim() ? "오늘 숙제가 비어 있어요." : null,
    !nextLessonPlan.trim() ? "다음 수업 계획이 비어 있어요." : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b2323]/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="오늘 수업 마무리"
    >
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.25)]">
        <div className="flex items-center gap-2 text-lg font-semibold text-[#2a2323]">
          <CheckCheck className="h-5 w-5 text-[#6852b8]" />
          오늘 수업 마무리
        </div>
        <div className="mt-1 text-sm text-[#756a67]">{groupName}</div>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl bg-[#f8f3ef] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">진도</div>
            <div className="mt-1 font-medium text-[#2b2323]">
              {defaultProgress.trim() || "입력된 진도가 없어요."}
            </div>
          </div>

          <div className="rounded-2xl bg-[#f5f2ff] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">출결</div>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="rounded-full bg-[#edf9f3] px-2 py-1 text-[#3d7f64]">출석 {counts.present}명</span>
              <span className="rounded-full bg-[#fdf3e4] px-2 py-1 text-[#94702f]">지각 {counts.late}명</span>
              <span className="rounded-full bg-[#fff0ef] px-2 py-1 text-[#a26660]">결석 {counts.absent}명</span>
            </div>
          </div>

          <div className="rounded-2xl bg-[#f8f3ef] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">오늘 숙제</div>
            <div className="mt-1 whitespace-pre-line font-medium text-[#2b2323]">
              {homework.trim() || "입력된 숙제가 없어요."}
            </div>
          </div>

          {makeupNames.length > 0 ? (
            <div className="rounded-2xl bg-[#fff7f5] p-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#a26660]">보충 필요</div>
              <div className="mt-1 font-medium text-[#8a5d52]">{makeupNames.join(", ")}</div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-[#edf9f3] p-3">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b77]">다음 수업</div>
            <div className="mt-1 whitespace-pre-line font-medium text-[#2b2323]">
              {nextLessonPlan.trim() || "입력된 계획이 없어요."}
            </div>
          </div>

          {reminders.length > 0 ? (
            <div className="rounded-2xl border border-[#f0d9d5] bg-[#fff9f7] p-3 text-[#7f5d57]">
              {reminders.map((reminder) => (
                <div key={reminder} className="flex items-center gap-1.5 text-sm">
                  <span aria-hidden>•</span> {reminder}
                </div>
              ))}
              <div className="mt-1 text-xs text-[#a08883]">그래도 그대로 완료할 수 있어요.</div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={onBack}>
            돌아가서 수정
          </Button>
          <Button type="button" disabled={isPending} onClick={onComplete} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            {isPending ? "저장 중..." : "수업 마무리 완료"}
          </Button>
        </div>
      </div>
    </div>
  );
}
