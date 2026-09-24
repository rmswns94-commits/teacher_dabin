import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DailyQuoteCard } from "@/components/daily-quote-card";
import { PageHeader } from "@/components/page-header";
import { dailyQuoteOf } from "@/lib/constants/daily-quotes";
import { addDaysStr } from "@/lib/calendar";
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
import {
  growthMonthLabel,
  growthPeriodRange,
  isKingOfKings,
  kingOfKingsMaxCount,
  shiftGrowthAnchor,
  toGrowthBadge,
  type GrowthViewMode,
  type StudentGrowthCardSummary,
} from "@/lib/growth-note";
import {
  getCurrentUserGroups,
  getGroupStudentsForCurrentUser,
} from "@/lib/supabase/queries/groups";
import {
  getGrowthHomeworkRows,
  getGrowthLessonRows,
  getGrowthMakeupRows,
  getGrowthPraiseRows,
  type GrowthLessonRow,
  type GrowthMakeupRow,
} from "@/lib/supabase/queries/growth-notes";
import { GrowthAwardsBoard, type AwardBoardCard } from "@/components/growth-awards-board";
import {
  awardsWonByStudent,
  buildStudentGrowthMetrics,
  computeGrowthAwards,
  growthAwardEmptyText,
  growthAwardKeys,
  growthAwardMeta,
  growthAwardMinimumLabel,
} from "@/lib/growth-awards";
import { getCurrentUserMemberships } from "@/lib/supabase/queries/students";
import type { GrowthAchievementType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// 기간(주/월) 계산은 lib/growth-note의 growthPeriodRange 단일 소스를 사용한다
// (주간: 한국 기준 월요일 시작 — 기존과 동일 결과, 월간: 1일~말일, 전부 KST date-only).


// 9개 성장왕 카드 테마 — 왕의 성격에 맞는 파스텔 그라데이션 + 반짝 포인트색.
// 장식은 정적(sparkle 아이콘 + 빛번짐)이라 iPad 성능 부담이 없다.
const growthKingThemes: Record<
  GrowthAchievementType,
  { card: string; title: string; desc: string; sparkle: string }
> = {
  // 꾸준함왕 — 성실함: 연베이지+크림, 골드 포인트
  consistency_master: {
    card: "border-[#ecdfc8] bg-gradient-to-br from-[#fdf9ef] via-[#f9f1e0] to-[#f4e9d3]",
    title: "text-[#6f5a30]",
    desc: "text-[#8b7550]",
    sparkle: "text-[#cfae67]",
  },
  // 단어왕 — 똑똑함: 라벤더+연보라, 보랏빛 sparkle
  vocabulary_master: {
    card: "border-[#ded2f0] bg-gradient-to-br from-[#faf7ff] via-[#f2ecfc] to-[#e9e0f8]",
    title: "text-[#5c4a9c]",
    desc: "text-[#7c6fa8]",
    sparkle: "text-[#a88fd8]",
  },
  // 집중왕 — 차분한 몰입: 민트+세이지, 청록 포인트
  focus_master: {
    card: "border-[#cfe6d8] bg-gradient-to-br from-[#f4fbf7] via-[#e8f5ec] to-[#dcefe4]",
    title: "text-[#2f6d54]",
    desc: "text-[#5c8272]",
    sparkle: "text-[#7fbfa4]",
  },
  // 발표왕 — 밝은 자신감: 피치+코랄, 별빛 포인트
  presentation_master: {
    card: "border-[#f4d5c4] bg-gradient-to-br from-[#fff6f0] via-[#ffe9dd] to-[#ffdfcf]",
    title: "text-[#b05f3e]",
    desc: "text-[#b3785f]",
    sparkle: "text-[#f0a583]",
  },
  // 배려왕 — 따뜻함: 블러시 핑크+연살구
  kindness_master: {
    card: "border-[#f3cfdb] bg-gradient-to-br from-[#fff6f8] via-[#ffe9ef] to-[#fcdde7]",
    title: "text-[#a94f6e]",
    desc: "text-[#b1798d]",
    sparkle: "text-[#ef9db8]",
  },
  // 질문왕 — 호기심: 하늘색+연노랑, 반짝 별 포인트
  question_master: {
    card: "border-[#d4e6f4] bg-gradient-to-br from-[#f3faff] via-[#e9f4fe] to-[#fdf6dd]",
    title: "text-[#3d6d99]",
    desc: "text-[#6d88a0]",
    sparkle: "text-[#7fb1dc]",
  },
  // 노력왕 — 성장 응원: 연하늘+민트 오로라
  effort_master: {
    card: "border-[#cfe7e2] bg-gradient-to-br from-[#f2fafc] via-[#e7f5f4] to-[#e2f2e9]",
    title: "text-[#2e7d72]",
    desc: "text-[#5f8d85]",
    sparkle: "text-[#7cc4b8]",
  },
  // 개근왕 — 건강한 성실: 연초록+크림
  attendance_master: {
    card: "border-[#d8e8c6] bg-gradient-to-br from-[#f7fbf0] via-[#eef7e2] to-[#e4f1d6]",
    title: "text-[#58762e]",
    desc: "text-[#7c9159]",
    sparkle: "text-[#a8c878]",
  },
  // 틈새왕 — 빈틈없는 완수: 레몬크림+피치베이지
  makeup_master: {
    card: "border-[#eeddb9] bg-gradient-to-br from-[#fffbee] via-[#fdf3d9] to-[#f9e9d2]",
    title: "text-[#8a6a25]",
    desc: "text-[#99804f]",
    sparkle: "text-[#dcb85f]",
  },
};

// 단어왕 판정용 최근 시험 조회는 90일로 bounded (전체 history 조회 금지)
const VOCAB_WINDOW_DAYS = 90;

// 성장노트 landing: 9개 성장왕 소개 + 반 선택.
// 학생 목록/Achievement 계산은 반을 선택한 다음에만 (lazy — 첫 화면은 가볍게).
export default async function GrowthNotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ group?: string; date?: string; view?: string }>;
}) {
  const { group: groupParam, date: dateParam, view: viewParam } = (await searchParams) ?? {};

  const groups = await getCurrentUserGroups();
  const selectedGroup = groupParam ? groups.find((group) => group.id === groupParam) ?? null : null;

  if (selectedGroup) {
    // URL이 기간 상태의 소스 — 새로고침/뒤로가기에도 주간·월간/기준 날짜가 유지된다.
    // 기본값은 기존과 동일하게 "이번 주" 주간 보기.
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : todayDateString();
    const mode: GrowthViewMode = viewParam === "month" ? "month" : "week";
    return <GroupStudentList group={selectedGroup} anchor={anchor} mode={mode} />;
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

          {/* 오늘의 명언 — 날짜(KST) 기준 365개 문구 중 하루 하나 */}
          <DailyQuoteCard quote={dailyQuoteOf(todayDateString())} />

          {/* 9개의 성장왕 — 순수 소개 화면 (달성 여부/랭킹/카운트 표시 금지) */}
          <section>
            <h2 className="card-title text-[#3a2f2c]">9개의 성장왕</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {growthAchievementValues.map((type) => {
                const theme = growthKingThemes[type];

                return (
                  <div
                    key={type}
                    className={cn(
                      "relative overflow-hidden rounded-3xl border p-4 shadow-sm transition",
                      "hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(120,100,90,0.12)]",
                      theme.card,
                    )}
                  >
                    {/* 은은한 빛번짐 + 정적 sparkle 1~2개 (애니메이션/깜빡임 없음) */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full bg-white/50 blur-2xl"
                    />
                    <Sparkles
                      aria-hidden
                      className={cn("pointer-events-none absolute right-3 top-3 h-4 w-4", theme.sparkle)}
                    />
                    <Sparkles
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute right-8 top-7 h-2.5 w-2.5 opacity-60",
                        theme.sparkle,
                      )}
                    />
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="text-2xl drop-shadow-sm">
                        {growthEmojis[type]}
                      </span>
                      <span className={cn("card-title", theme.title)}>
                        {growthLabels[type]}
                      </span>
                    </div>
                    <p className={cn("mt-2 text-sm leading-5", theme.desc)}>
                      {growthGuideDescriptions[type]}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 반 선택 — [전체] 버튼/검색/드롭다운 없음 */}
          <section className="mt-8 pb-8">
            <h2 className="card-title text-[#3a2f2c]">내 성장노트 확인하기</h2>
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
                        <div className="card-title truncate text-[#3a2f2c]">
                          {group.name}
                        </div>
                        <div className="mt-0.5 text-sm text-[#8a7b77]">
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
// 주간/월간은 "어떤 기간을 집계하느냐"만 다르다 — 같은 카드 renderer/같은 판정 엔진에
// period range만 바꿔 전달한다 (월간 전용 알고리즘/화면 없음).
async function GroupStudentList({
  group,
  anchor,
  mode,
}: {
  group: { id: string; name: string };
  anchor: string;
  mode: GrowthViewMode;
}) {
  const today = todayDateString();
  const { start: periodStart, end: periodEnd } = growthPeriodRange(anchor, mode);
  const windowStart = addDaysStr(periodStart, -VOCAB_WINDOW_DAYS);
  const isCurrentPeriod = growthPeriodRange(today, mode).start === periodStart;
  // 새 왕 6종의 집계 기간 — 진행 중인 주/월은 오늘(KST)까지만 (미래 숙제/수업을 실패로 세지 않는다).
  // 도약왕은 바로 이전 주/달(같은 growthPeriodRange/shiftGrowthAnchor helper)과 비교한다.
  const effectiveEnd = periodEnd < today ? periodEnd : today;
  const previousRange = growthPeriodRange(shiftGrowthAnchor(anchor, mode, -1), mode);
  const previousPeriod = {
    start: previousRange.start,
    end: previousRange.end < today ? previousRange.end : today,
  };
  const hrefFor = (date: string, view: GrowthViewMode) =>
    `/growth-notes?group=${group.id}&view=${view}&date=${date}`;
  const periodLabel =
    mode === "month"
      ? growthMonthLabel(periodStart)
      : `${formatKoreanDate(periodStart)} ~ ${formatKoreanDate(periodEnd)}`;

  const members = await getGroupStudentsForCurrentUser(group.id);
  const students = members.filter((student) => !student.archived);
  // 같은 학생이 중복 row로 오더라도 한 번만
  const uniqueStudents = [...new Map(students.map((student) => [student.id, student])).values()];
  const studentIds = uniqueStudents.map((student) => student.id);

  // 선택한 반 학생만 batch 조회 (학생별/날짜별 개별 쿼리 금지 — 기간과 무관하게 4쿼리).
  // 수업 기록 window(기간 시작 -90일)는 도약왕의 이전 주/달까지 자연히 덮는다 — 별도 previous 쿼리 없음.
  // 숙제는 [이전 기간 시작, effective 끝] 한 범위로 가져와 메모리에서 기간을 나눈다.
  const [lessonRows, praiseRows, makeupRows, homeworkRows] = await Promise.all([
    getGrowthLessonRows(windowStart, periodEnd, studentIds),
    getGrowthPraiseRows(periodStart, studentIds),
    getGrowthMakeupRows(periodStart, periodEnd, studentIds),
    getGrowthHomeworkRows(previousPeriod.start, effectiveEnd, studentIds),
  ]);

  const rowsByStudent = new Map<string, GrowthLessonRow[]>();
  for (const row of lessonRows) {
    rowsByStudent.set(row.student_id, [...(rowsByStudent.get(row.student_id) ?? []), row]);
  }

  const makeupsByStudent = new Map<string, GrowthMakeupRow[]>();
  for (const row of makeupRows) {
    makeupsByStudent.set(row.student_id, [...(makeupsByStudent.get(row.student_id) ?? []), row]);
  }

  // 칭찬은 (연결된 일지 날짜 ?? 작성일 KST) 기준으로 선택 기간만 센다 — manual praise만 존재
  const logDateById = new Map(lessonRows.map((row) => [row.daily_log_id, row.class_date]));
  const praiseCountByStudent = new Map<string, number>();
  for (const praise of praiseRows) {
    const date =
      (praise.daily_log_id ? logDateById.get(praise.daily_log_id) : null) ??
      toDateString(new Date(praise.created_at));
    if (date >= periodStart && date <= periodEnd) {
      praiseCountByStudent.set(
        praise.student_id,
        (praiseCountByStudent.get(praise.student_id) ?? 0) + 1,
      );
    }
  }

  const summaries: StudentGrowthCardSummary[] = uniqueStudents
    .map((student) => {
      const rows = rowsByStudent.get(student.id) ?? [];
      // 기존 판정 엔진 그대로 — 기간 record만 주/월 range로 바꿔 전달한다
      const periodRows = rows.filter((row) => row.class_date >= periodStart);
      const growth = computeWeeklyGrowth({
        weekRecords: periodRows.map((row) => ({
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
        weekMakeups: scopeMakeupsToWeek(
          makeupsByStudent.get(student.id) ?? [],
          periodStart,
          periodEnd,
        ),
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

  // ── 새 왕 6종 (derived only — 저장 없음). winner 선정과 근거가 같은 normalized metrics를 공유한다.
  // 출결/온라인 복습은 이미 받은 수업 기록(class_date 귀속), 숙제는 due_date 귀속 + 완료 시각 cutoff.
  const metricsByStudent = buildStudentGrowthMetrics({
    studentIds,
    lessons: lessonRows.map((row) => ({
      studentId: row.student_id,
      classDate: row.class_date,
      attendance: row.attendance,
      onlineReviewCompleted: row.online_review_completed,
    })),
    homework: homeworkRows.map((row) => ({
      id: row.id,
      dueDate: row.due_date,
      completed: row.completed,
      completedAt: row.completed_at,
      assignedStudentId: row.assigned_student_id,
      attendeeStudentIds: row.attendee_student_ids,
    })),
    current: { start: periodStart, end: effectiveEnd },
    previous: previousPeriod,
  });
  const awards = computeGrowthAwards([...metricsByStudent.values()], mode);
  const awardsWon = awardsWonByStudent(awards);
  const nameById = new Map(uniqueStudents.map((student) => [student.id, student.name]));
  const periodUnit = mode === "month" ? "이번 달" : "이번 주";
  const awardCards: AwardBoardCard[] = growthAwardKeys.map((key) => ({
    key,
    ...growthAwardMeta[key],
    minimumLabel: growthAwardMinimumLabel(key, mode),
    winners: awards[key].winners
      .map((metric) => ({
        studentId: metric.studentId,
        name: nameById.get(metric.studentId) ?? "학생",
        evidence: metric.evidence,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    emptyText: growthAwardEmptyText(key, awards[key].emptyReason, mode),
  }));

  // 왕중왕 count = 기존 성장 배지 수 + 이번 기간 새 왕 수 (award당 +1, 학생 id 기준 dedupe).
  // 왕중왕 자체는 count에 포함하지 않는다. 동점 전원, 전원 0개면 없음 (기존 helper 그대로).
  const titleCountByStudent = new Map(
    summaries.map((summary) => [
      summary.studentId,
      summary.achievements.length + (awardsWon.get(summary.studentId)?.length ?? 0),
    ]),
  );
  const maxTitleCount = kingOfKingsMaxCount([...titleCountByStudent.values()]);
  const kingWinners = summaries
    .filter((summary) => isKingOfKings(titleCountByStudent.get(summary.studentId) ?? 0, maxTitleCount))
    .map((summary) => ({
      studentId: summary.studentId,
      name: summary.studentName,
      titles: [
        ...summary.achievements.map((badge) => ({ key: badge.type, emoji: badge.emoji, label: badge.label })),
        ...(awardsWon.get(summary.studentId) ?? []).map((key) => ({
          key,
          emoji: growthAwardMeta[key].emoji,
          label: growthAwardMeta[key].label,
        })),
      ],
    }));

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
            <p className="mt-1 text-sm text-[#8a7b77]">우리 반 성장노트를 확인해요.</p>
          </div>

          {/* 주간/월간 전환 + 기간 이동 — URL(?view=&date=)이 상태라 F5/뒤로가기에도 유지.
              토글은 현재 보고 있는 anchor 날짜를 그대로 들고 가서(오늘로 jump 금지)
              그 날짜가 속한 주/달을 보여준다. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="성장노트 기간 단위"
              className="flex gap-1 rounded-2xl border border-[#efe4de] bg-[#fffdfb] p-1"
            >
              <Link
                href={hrefFor(anchor, "week")}
                aria-current={mode === "week" ? "true" : undefined}
                className={cn(
                  "tap-press-subtle rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                  mode === "week"
                    ? "border border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                    : "border border-transparent text-[#8a7b77] hover:bg-[#faf6f3]",
                )}
              >
                주간
              </Link>
              <Link
                href={hrefFor(anchor, "month")}
                aria-current={mode === "month" ? "true" : undefined}
                className={cn(
                  "tap-press-subtle rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                  mode === "month"
                    ? "border border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                    : "border border-transparent text-[#8a7b77] hover:bg-[#faf6f3]",
                )}
              >
                월간
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" className="gap-1" asChild>
                <Link
                  href={hrefFor(shiftGrowthAnchor(anchor, mode, -1), mode)}
                  aria-label={mode === "month" ? "이전 달" : "이전 주"}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  {mode === "month" ? "이전 달" : "이전 주"}
                </Link>
              </Button>
              <span className="card-title tabular-nums text-[#2a2323]">{periodLabel}</span>
              <Button variant="secondary" size="sm" className="gap-1" asChild>
                <Link
                  href={hrefFor(shiftGrowthAnchor(anchor, mode, 1), mode)}
                  aria-label={mode === "month" ? "다음 달" : "다음 주"}
                >
                  {mode === "month" ? "다음 달" : "다음 주"}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              {!isCurrentPeriod ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={hrefFor(today, mode)}>
                    {mode === "month" ? "이번 달" : "이번 주"}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          {summaries.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-[#efe4de] bg-[#fffdfb] p-8 text-center text-sm text-[#8a7b77]">
              이 반에는 아직 성장노트를 확인할 학생이 없어요.
            </div>
          ) : (
            <>
              {/* 이번 기간의 왕 — 반 학생끼리 비교하는 derived 보드 (저장 없음). 학생 클릭 → 근거 inline 펼침. */}
              <section className="mt-5">
                <h2 className="card-title text-[#3a2f2c]">{periodUnit}의 왕</h2>
                <p className="mt-1 text-sm text-[#8a7b77]">
                  학생을 누르면 왜 왕이 되었는지 바로 볼 수 있어요. 왕중왕은 성장 배지와 왕을 합쳐서 세요.
                </p>
                <div className="mt-3">
                  <GrowthAwardsBoard
                    cards={awardCards}
                    king={kingWinners.length > 0 ? { winners: kingWinners } : null}
                    periodUnit={periodUnit}
                  />
                </div>
              </section>

            <div className="mt-5 space-y-3 pb-8">
              {(() => {
                // 왕중왕(derived UI): 성장 배지 + 이번 기간 새 왕을 합친 title count(위 titleCountByStudent)로
                // 판정한다. 동점자는 전부 공동 왕중왕, 전원 0개면 없음.
                // 목록 순서는 그대로(이름순) — 랭킹 정렬 금지 정책 유지.
                return summaries.map((summary) => {
                  const king = isKingOfKings(titleCountByStudent.get(summary.studentId) ?? 0, maxTitleCount);

                  return (
                    <Link
                      key={summary.studentId}
                      href={`/growth-notes/${summary.studentId}`}
                      data-king-of-kings={king ? "" : undefined}
                      className={cn(
                        "group flex w-full flex-col gap-3 rounded-3xl border p-4 shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b9a5e3] sm:flex-row sm:items-center sm:gap-4 sm:p-5",
                        king
                          ? "relative overflow-hidden border-[#e9d5a4] bg-gradient-to-br from-[#fffdf4] via-[#fdf6e2] to-[#fbf0d8] shadow-[0_4px_18px_rgba(203,169,92,0.18)] hover:border-[#dfc78f] hover:shadow-[0_6px_22px_rgba(203,169,92,0.26)]"
                          : "border-[#efe4de] bg-[#fffdfb] hover:border-[#e0d2f2] hover:bg-[#fdfbff]",
                      )}
                    >
                      {king ? (
                        <>
                          {/* 은은한 sheen(느린 주기, reduced-motion에서는 표시 안 함) +
                              정적 빛번짐/sparkle — 전부 pointer-events 없음 (클릭 방해 금지) */}
                          <span
                            aria-hidden
                            className="king-of-kings-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                          />
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#f6e3ae]/60 blur-2xl"
                          />
                          <Sparkles
                            aria-hidden
                            className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-[#d9b45e]"
                          />
                          <Sparkles
                            aria-hidden
                            className="pointer-events-none absolute right-9 top-6 h-2.5 w-2.5 text-[#d9b45e] opacity-60"
                          />
                        </>
                      ) : null}

                      <div className="flex items-center justify-between gap-2 sm:w-52 sm:shrink-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 truncate text-lg font-bold text-[#3a2f2c]">
                            {summary.studentName}
                          </div>
                          {king ? (
                            <span className="shrink-0 rounded-full border border-[#e5cf9a] bg-gradient-to-r from-[#fdf6e0] to-[#fbeecb] px-2 py-0.5 text-xs font-bold text-[#8a6a25]">
                              👑 왕중왕
                            </span>
                          ) : null}
                        </div>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4] sm:hidden"
                          aria-hidden
                        />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
                        {summary.achievements.length === 0 ? (
                          <span className="text-sm text-[#8a7b77]">🌱 성장 기록이 쌓이는 중이에요</span>
                        ) : (
                          // 획득한 왕 title 전부 표시 — "+N" 축약 없음, 카드 안에서 wrap
                          summary.achievements.map((badge) => (
                            <span
                              key={badge.type}
                              className="rounded-full bg-[#f0f7f2] px-2.5 py-1 text-xs font-semibold text-[#3d7f64]"
                            >
                              {badge.emoji} {badge.label}
                            </span>
                          ))
                        )}
                        {summary.praiseCount > 0 ? (
                          <span className="rounded-full bg-[#fdf8ec] px-2.5 py-1 text-xs font-semibold text-[#8a6828]">
                            💜 {mode === "month" ? "이번 달" : "이번 주"} 칭찬 {summary.praiseCount}회
                          </span>
                        ) : null}
                      </div>

                      <ChevronRight
                        className="hidden h-4 w-4 shrink-0 text-[#c4b6b0] transition group-hover:text-[#8f7bc4] sm:block"
                        aria-hidden
                      />
                    </Link>
                  );
                });
              })()}
            </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
