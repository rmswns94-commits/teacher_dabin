import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, toDateString, todayDateString } from "@/lib/dates";
import { vocabPercent } from "@/lib/elementary";
import { scopeMakeupsToWeek } from "@/lib/growth";
import { buildGrowthNoteViewModel } from "@/lib/growth-note";
import {
  getGrowthLessonRows,
  getGrowthMakeupRows,
  getGrowthPraiseRows,
} from "@/lib/supabase/queries/growth-notes";
import {
  getStudentByIdForCurrentUser,
  getStudentGroupsForCurrentUser,
} from "@/lib/supabase/queries/students";

// 한국 기준 주 시작(월요일). 날짜 문자열만으로 계산해 timezone 밀림이 없다.
function weekStartOf(ymd: string) {
  return addDaysStr(ymd, -((dayOfWeekOf(ymd) + 6) % 7));
}

const VOCAB_WINDOW_DAYS = 90;

// 학생에게 iPad로 그대로 보여주는 화면 — Teacher 관리 UI(수정/삭제/메모/학부모 전달)는
// 이 페이지에 렌더하지 않고, ViewModel에도 private 필드를 넣지 않는다.
export default async function GrowthNoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams?: Promise<{ week?: string }>;
}) {
  const { studentId } = await params;
  const { week } = (await searchParams) ?? {};

  const today = todayDateString();
  const currentWeekStart = weekStartOf(today);
  const requestedWeek =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekStartOf(week) : currentWeekStart;
  const weekStart = requestedWeek > currentWeekStart ? currentWeekStart : requestedWeek;
  const weekEnd = addDaysStr(weekStart, 6);
  const windowStart = addDaysStr(weekStart, -VOCAB_WINDOW_DAYS);

  const [student, studentGroups, lessonRows, praiseRows, makeupRows] = await Promise.all([
    getStudentByIdForCurrentUser(studentId),
    getStudentGroupsForCurrentUser(studentId),
    getGrowthLessonRows(windowStart, weekEnd, [studentId]),
    getGrowthPraiseRows(weekStart, [studentId]),
    getGrowthMakeupRows(weekStart, weekEnd, [studentId]),
  ]);

  if (!student) {
    notFound();
  }

  const weekRows = lessonRows.filter((row) => row.class_date >= weekStart);
  const logDateById = new Map(lessonRows.map((row) => [row.daily_log_id, row.class_date]));
  // Teacher가 [칭찬 한표]로 직접 남긴 이번 주 코멘트만 (오래된 → 최신)
  const weekPraiseComments = praiseRows
    .filter((praise) => {
      const date =
        (praise.daily_log_id ? logDateById.get(praise.daily_log_id) : null) ??
        toDateString(new Date(praise.created_at));
      return date >= weekStart && date <= weekEnd && Boolean(praise.comment);
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((praise) => praise.comment!);

  const note = buildGrowthNoteViewModel({
    studentName: student.name,
    groupNames: studentGroups.map((group) => group.name),
    weekStart,
    weekEnd,
    weekRecords: weekRows.map((row) => ({
      attendance: row.attendance,
      homeworkStatus: row.homework_status,
      focusLevel: row.focus_level,
      participationLevel: row.participation_level,
      questionLevel: row.question_level,
      kindnessLevel: row.kindness_level,
      effortLevel: row.effort_level,
      vocabRetest: row.vocab_retest,
      strengths: row.strengths,
    })),
    recentVocabPercents: lessonRows
      .filter((row) => row.vocab_correct !== null && (row.vocab_total ?? 0) > 0)
      .map((row) => vocabPercent(row.vocab_correct!, row.vocab_total!)!),
    weekPraiseComments,
    weekMakeups: scopeMakeupsToWeek(makeupRows, weekStart, weekEnd),
  });

  const prevWeek = addDaysStr(weekStart, -7);
  const nextWeek = addDaysStr(weekStart, 7);

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/growth-notes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6b6b74] transition hover:text-[#33333b]"
          >
            <ArrowLeft className="h-4 w-4" /> 성장노트
          </Link>

          <div className="mt-3">
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-[#3a2f2c]">
              🌱 {note.studentName} 성장노트
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {note.groupNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-[#f3eefa] px-2.5 py-1 text-[11px] font-medium text-[#6d5aa8]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#efe4de] bg-[#fffdfb] px-3 py-2 text-sm">
            <Link
              href={`/growth-notes/${studentId}?week=${prevWeek}`}
              className="rounded-lg px-2 py-1 text-[#6b6b74] transition hover:bg-[#f4f0ec]"
            >
              ← 이전 주
            </Link>
            <span className="font-semibold tabular-nums text-[#3a2f2c]">
              {formatKoreanDate(note.weekStart)} ~ {formatKoreanDate(note.weekEnd)}
            </span>
            {weekStart < currentWeekStart ? (
              <Link
                href={`/growth-notes/${studentId}?week=${nextWeek}`}
                className="rounded-lg px-2 py-1 text-[#6b6b74] transition hover:bg-[#f4f0ec]"
              >
                다음 주 →
              </Link>
            ) : (
              <span className="px-2 py-1 text-[#d5cbc6]">다음 주 →</span>
            )}
          </div>

          <div className="mt-5 space-y-4">
            {/* 1. 이번 주의 성장 배지 */}
            <section className="rounded-3xl border border-[#e5efe8] bg-[#f6fbf8] p-5">
              <h2 className="text-sm font-bold text-[#2f6d54]">이번 주의 성장 배지</h2>
              {note.badges.length === 0 ? (
                <p className="mt-3 text-[15px] leading-7 text-[#3d7f64]">
                  이번 주에도 새로운 성장 기록이 차곡차곡 쌓이고 있어요 🌱
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {note.badges.map((badge) => (
                    <li key={badge.type} className="flex items-start gap-3">
                      <span aria-hidden className="text-2xl leading-8">
                        {badge.emoji}
                      </span>
                      <div>
                        <div className="text-[15px] font-bold text-[#2f6d54]">{badge.label}</div>
                        <div className="text-sm leading-6 text-[#3d7f64]">{badge.sentence}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 2. 이번 주의 한마디 */}
            <section className="rounded-3xl border border-[#eae2f5] bg-[#faf7ff] p-5">
              <h2 className="text-sm font-bold text-[#6d5aa8]">💜 이번 주의 한마디</h2>
              <p className="mt-2 text-[16px] font-medium leading-8 text-[#4d3f7a]">
                &ldquo;{note.encouragement}&rdquo;
              </p>
            </section>

            {/* 2.5. 이번 주 선생님의 칭찬 — Teacher가 [칭찬 한표]로 직접 남긴 코멘트 원문만 */}
            {note.teacherPraises.length > 0 ? (
              <section className="rounded-3xl border border-[#f0e3ea] bg-[#fffafc] p-5">
                <h2 className="text-sm font-bold text-[#9c5577]">💌 이번 주 선생님의 칭찬</h2>
                {note.teacherPraises.length === 1 ? (
                  <p className="mt-2 text-[16px] font-medium leading-8 text-[#7a4a62]">
                    &ldquo;{note.teacherPraises[0]}&rdquo;
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[#7a4a62]">
                    {note.teacherPraises.map((text) => (
                      <li key={text}>💜 {text}</li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {/* 3. 이번 주 잘한 일 */}
            {note.goodThings.length > 0 ? (
              <section className="rounded-3xl border border-[#f2e8d9] bg-[#fffaf1] p-5">
                <h2 className="text-sm font-bold text-[#8a6828]">⭐ 이번 주 잘한 일</h2>
                <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[#6d5420]">
                  {note.goodThings.map((text) => (
                    <li key={text}>⭐ {text}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* 4. 숙제 / 꾸준함 */}
            {note.homework ? (
              <section className="rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-5">
                <h2 className="text-sm font-bold text-[#4d3a3a]">📚 이번 주 숙제</h2>
                <div className="mt-2 text-xl font-bold tabular-nums text-[#3a2f2c]">
                  {note.homework.completed} / {note.homework.evaluated} 완료
                </div>
                <p className="mt-1 text-sm leading-6 text-[#6b5d58]">{note.homework.sentence}</p>
              </section>
            ) : null}

            {/* 5. 단어 성장 */}
            {note.vocab ? (
              <section className="rounded-3xl border border-[#e8e2f5] bg-[#fbfaff] p-5">
                <h2 className="text-sm font-bold text-[#54479c]">📝 단어 성장</h2>
                <div className="mt-2 text-xl font-bold tabular-nums text-[#54479c]">
                  {/* 하락일 때는 화살표 없이 중립 표시 — 부정 강조 금지 */}
                  {note.vocab.rise !== null
                    ? note.vocab.percents.join(" → ")
                    : note.vocab.percents.join(" · ")}
                </div>
                {note.vocab.sentence ? (
                  <p className="mt-1 text-sm leading-6 text-[#6d5fae]">{note.vocab.sentence}</p>
                ) : null}
              </section>
            ) : null}

            {/* 6. 출석 */}
            {note.attendance ? (
              <section className="rounded-3xl border border-[#e5efe8] bg-[#fbfdfc] p-5">
                <h2 className="text-sm font-bold text-[#2f6d54]">🏫 이번 주 출석</h2>
                <div className="mt-2 text-xl font-bold tabular-nums text-[#2f6d54]">
                  {note.attendance.attended} / {note.attendance.total}
                </div>
                {note.attendance.sentence ? (
                  <p className="mt-1 text-sm leading-6 text-[#3d7f64]">{note.attendance.sentence}</p>
                ) : null}
              </section>
            ) : null}

            {/* 7. 선생님이 발견한 멋진 모습 */}
            {note.teacherHighlights.length > 0 ? (
              <section className="rounded-3xl border border-[#f0e3ea] bg-[#fffafc] p-5">
                <h2 className="text-sm font-bold text-[#9c5577]">💜 선생님이 발견한 멋진 모습</h2>
                <ul className="mt-3 space-y-2">
                  {note.teacherHighlights.map((text) => (
                    <li key={text} className="text-[15px] leading-7 text-[#7a4a62]">
                      &ldquo;{text}&rdquo;
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* 8. 다음 주 작은 목표 */}
            {note.nextGoals.length > 0 ? (
              <section className="rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-5">
                <h2 className="text-sm font-bold text-[#4d3a3a]">🎯 다음 주 작은 목표</h2>
                <ul className="mt-3 space-y-2 text-[15px] leading-7 text-[#6b5d58]">
                  {note.nextGoals.map((text) => (
                    <li key={text}>• {text}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!note.hasWeekRecords ? (
              <p className="pb-4 text-center text-sm text-[#8a7b77]">
                이번 주 기록이 조금씩 쌓이고 있어요 🌱
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
