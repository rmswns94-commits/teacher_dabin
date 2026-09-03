import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, toDateString, todayDateString } from "@/lib/dates";
import { vocabPercent } from "@/lib/elementary";
import {
  computeWeeklyGrowth,
  growthAchievementValues,
  growthEmojis,
  growthGuideDescriptions,
  growthLabels,
  scopeMakeupsToWeek,
} from "@/lib/growth";
import { toGrowthBadge, type StudentGrowthCardSummary } from "@/lib/growth-note";
import {
  getCurrentUserGroups,
  getGroupStudentsForCurrentUser,
} from "@/lib/supabase/queries/groups";
import {
  getGrowthLessonRows,
  getGrowthMakeupRows,
  getGrowthPraiseRows,
  type GrowthLessonRow,
  type GrowthMakeupRow,
} from "@/lib/supabase/queries/growth-notes";
import { getCurrentUserMemberships } from "@/lib/supabase/queries/students";

// 한국 기준 주 시작(월요일). 날짜 문자열만으로 계산해 timezone 밀림이 없다.
function weekStartOf(ymd: string) {
  return addDaysStr(ymd, -((dayOfWeekOf(ymd) + 6) % 7));
}

// 단어왕 판정용 최근 시험 조회는 90일로 bounded (전체 history 조회 금지)
const VOCAB_WINDOW_DAYS = 90;

// 성장노트 landing: 9개 성장왕 소개 + 반 선택.
// 학생 목록/Achievement 계산은 반을 선택한 다음에만 (lazy — 첫 화면은 가볍게).
export default async function GrowthNotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ group?: string }>;
}) {
  const { group: groupParam } = (await searchParams) ?? {};

  const groups = await getCurrentUserGroups();
  const selectedGroup = groupParam ? groups.find((group) => group.id === groupParam) ?? null : null;

  if (selectedGroup) {
    return <GroupStudentList group={selectedGroup} />;
  }

  // ---- Landing: 설명은 local constant, 쿼리는 그룹 목록 + membership 수뿐 ----
  const memberships = await getCurrentUserMemberships();
  const studentCountByGroup = new Map<string, Set<string>>();
  for (const membership of memberships) {
    const set = studentCountByGroup.get(membership.group_id) ?? new Set<string>();
    set.add(membership.student_id);
    studentCountByGroup.set(membership.group_id, set);
  }

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            title="🌱 성장노트"
            description="이번 주에는 어떤 모습으로 성장해볼까요?"
          />

          {/* 9개의 성장왕 — 순수 소개 화면 (달성 여부/랭킹/카운트 표시 금지) */}
          <section>
            <h2 className="text-base font-bold text-[#3a2f2c]">9개의 성장왕</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {growthAchievementValues.map((type) => (
                <div
                  key={type}
                  className="rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-2xl">
                      {growthEmojis[type]}
                    </span>
                    <span className="text-[15px] font-bold text-[#3a2f2c]">
                      {growthLabels[type]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6b5d58]">
                    {growthGuideDescriptions[type]}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 반 선택 — [전체] 버튼/검색/드롭다운 없음 */}
          <section className="mt-8 pb-8">
            <h2 className="text-base font-bold text-[#3a2f2c]">내 성장노트 확인하기</h2>
            <p className="mt-1 text-sm text-[#8a7b77]">반을 선택해주세요.</p>

            {groups.length === 0 ? (
              <div className="mt-3 rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-8 text-center text-sm text-[#8a7b77]">
                아직 등록된 수업 반이 없어요.
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {groups.map((group) => {
                  const count = studentCountByGroup.get(group.id)?.size ?? 0;

                  return (
                    <Link
                      key={group.id}
                      href={`/growth-notes?group=${group.id}`}
                      className="group flex items-center justify-between gap-3 rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-4 shadow-sm transition hover:border-[#e0d2f2] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold text-[#3a2f2c]">
                          {group.name}
                        </div>
                        <div className="mt-0.5 text-xs text-[#8a7b77]">
                          성장노트 확인하기{count > 0 ? ` · ${count}명` : ""}
                        </div>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4]"
                        aria-hidden
                      />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

// ---- 반 선택 후: 해당 반 학생 목록 (학생 한 명 = full-width 한 줄) ----
async function GroupStudentList({ group }: { group: { id: string; name: string } }) {
  const today = todayDateString();
  const weekStart = weekStartOf(today);
  const weekEnd = addDaysStr(weekStart, 6);
  const windowStart = addDaysStr(weekStart, -VOCAB_WINDOW_DAYS);

  const members = await getGroupStudentsForCurrentUser(group.id);
  const students = members.filter((student) => !student.archived);
  // 같은 학생이 중복 row로 오더라도 한 번만
  const uniqueStudents = [...new Map(students.map((student) => [student.id, student])).values()];
  const studentIds = uniqueStudents.map((student) => student.id);

  // 선택한 반 학생만 batch 조회 (학생별 개별 쿼리 금지)
  const [lessonRows, praiseRows, makeupRows] = await Promise.all([
    getGrowthLessonRows(windowStart, weekEnd, studentIds),
    getGrowthPraiseRows(weekStart, studentIds),
    getGrowthMakeupRows(weekStart, weekEnd, studentIds),
  ]);

  const rowsByStudent = new Map<string, GrowthLessonRow[]>();
  for (const row of lessonRows) {
    rowsByStudent.set(row.student_id, [...(rowsByStudent.get(row.student_id) ?? []), row]);
  }

  const makeupsByStudent = new Map<string, GrowthMakeupRow[]>();
  for (const row of makeupRows) {
    makeupsByStudent.set(row.student_id, [...(makeupsByStudent.get(row.student_id) ?? []), row]);
  }

  // 칭찬은 (연결된 일지 날짜 ?? 작성일 KST) 기준으로 이번 주만 센다 — manual praise만 존재
  const logDateById = new Map(lessonRows.map((row) => [row.daily_log_id, row.class_date]));
  const praiseCountByStudent = new Map<string, number>();
  for (const praise of praiseRows) {
    const date =
      (praise.daily_log_id ? logDateById.get(praise.daily_log_id) : null) ??
      toDateString(new Date(praise.created_at));
    if (date >= weekStart && date <= weekEnd) {
      praiseCountByStudent.set(
        praise.student_id,
        (praiseCountByStudent.get(praise.student_id) ?? 0) + 1,
      );
    }
  }

  const summaries: StudentGrowthCardSummary[] = uniqueStudents
    .map((student) => {
      const rows = rowsByStudent.get(student.id) ?? [];
      const weekRows = rows.filter((row) => row.class_date >= weekStart);
      const growth = computeWeeklyGrowth({
        weekRecords: weekRows.map((row) => ({
          attendance: row.attendance,
          homeworkStatus: row.homework_status,
          focusLevel: row.focus_level,
          participationLevel: row.participation_level,
          questionLevel: row.question_level,
          kindnessLevel: row.kindness_level,
          effortLevel: row.effort_level,
        })),
        recentVocabPercents: rows
          .filter((row) => row.vocab_correct !== null && (row.vocab_total ?? 0) > 0)
          .map((row) => vocabPercent(row.vocab_correct!, row.vocab_total!)!),
        weekMakeups: scopeMakeupsToWeek(makeupsByStudent.get(student.id) ?? [], weekStart, weekEnd),
      });

      return {
        studentId: student.id,
        studentName: student.name,
        achievements: growth.achieved.map(toGrowthBadge),
        praiseCount: praiseCountByStudent.get(student.id) ?? 0,
      };
    })
    // 이름순 정렬 — Achievement 개수 정렬은 랭킹처럼 보이므로 금지
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/growth-notes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6b6b74] transition hover:text-[#33333b]"
          >
            <ArrowLeft className="h-4 w-4" /> 성장노트
          </Link>

          <div className="mt-3">
            <h1 className="text-2xl font-bold tracking-[-0.01em] text-[#3a2f2c]">{group.name}</h1>
            <p className="mt-1 text-sm text-[#8a7b77]">
              우리 반 성장노트를 확인해요 · {formatKoreanDate(weekStart)} ~{" "}
              {formatKoreanDate(weekEnd)}
            </p>
          </div>

          {summaries.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-8 text-center text-sm text-[#8a7b77]">
              이 반에는 아직 성장노트를 확인할 학생이 없어요.
            </div>
          ) : (
            <div className="mt-5 space-y-3 pb-8">
              {summaries.map((summary) => {
                const shown = summary.achievements.slice(0, 3);
                const extra = summary.achievements.length - shown.length;

                return (
                  <Link
                    key={summary.studentId}
                    href={`/growth-notes/${summary.studentId}`}
                    className="group flex w-full flex-col gap-3 rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-4 shadow-sm transition hover:border-[#e0d2f2] hover:bg-[#fdfbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3] sm:flex-row sm:items-center sm:gap-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-2 sm:w-48 sm:shrink-0">
                      <div className="min-w-0 truncate text-lg font-bold text-[#3a2f2c]">
                        {summary.studentName}
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4] sm:hidden"
                        aria-hidden
                      />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
                      {shown.length === 0 ? (
                        <span className="text-xs text-[#8a7b77]">🌱 성장 기록이 쌓이는 중이에요</span>
                      ) : (
                        <>
                          {shown.map((badge) => (
                            <span
                              key={badge.type}
                              className="rounded-full bg-[#f0f7f2] px-2.5 py-1 text-[11px] font-semibold text-[#3d7f64]"
                            >
                              {badge.emoji} {badge.label}
                            </span>
                          ))}
                          {extra > 0 ? (
                            <span className="rounded-full bg-[#f4f1ee] px-2.5 py-1 text-[11px] font-medium text-[#8a7b77]">
                              +{extra}
                            </span>
                          ) : null}
                        </>
                      )}
                      {summary.praiseCount > 0 ? (
                        <span className="rounded-full bg-[#fdf8ec] px-2.5 py-1 text-[11px] font-semibold text-[#8a6828]">
                          💜 이번 주 칭찬 {summary.praiseCount}회
                        </span>
                      ) : null}
                    </div>

                    <ChevronRight
                      className="hidden h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4] sm:block"
                      aria-hidden
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
