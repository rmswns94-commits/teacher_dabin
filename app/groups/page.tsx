import { AppShell } from "@/components/app-shell";
import { GroupCreateDialog } from "@/components/group-create-dialog";
import { GroupsOverview, type GroupCardData } from "@/components/groups-overview";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PendingButton } from "@/components/pending-button";
import { addDaysStr, dayOfWeekOf } from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { formatGrade } from "@/lib/grades";
import { activePreparationItems } from "@/lib/preparation";
import {
  DAY_LABELS,
  formatDayList,
  formatTimeHM,
  getGroupNextOccurrences,
  groupSchedulesByTime,
  type GroupNextOccurrence,
} from "@/lib/schedule";
import {
  getAllGroupStudentCounts,
  getAttendanceSummaryForLogs,
  getCurrentUserGroups,
  getLatestLogPerGroup,
  getUpcomingGroupExams,
} from "@/lib/supabase/queries/groups";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import { restoreGroupAction } from "./actions";

// "9월 4일 (금) 18:00" 같은 짧은 다음 수업 표기.
function formatNextLabel(occ: GroupNextOccurrence) {
  if (occ.daysFromNow === 0) {
    return `오늘 ${occ.startTime}`;
  }

  if (occ.daysFromNow === 1) {
    return `내일 ${occ.startTime}`;
  }

  return `${formatKoreanDate(occ.date)} (${DAY_LABELS[dayOfWeekOf(occ.date)]}) ${occ.startTime}`;
}

// "1시간 40분 후" — 오늘 남은 수업에만 붙이는 compact 카운트다운 (실시간 갱신 없음).
function formatRelative(minutes: number) {
  if (minutes < 1) {
    return "곧 시작";
  }

  if (minutes < 60) {
    return `${minutes}분 후`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}시간 ${rest}분 후` : `${hours}시간 후`;
}

function daysBetween(fromYmd: string, toYmd: string) {
  return Math.round(
    (Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) / 86_400_000,
  );
}

export default async function GroupsPage() {
  const now = new Date();
  const today = todayDateString();
  const todayDow = dayOfWeekOf(today);

  // 첫 화면 요약에 필요한 데이터만 병렬 batch 조회 (그룹당 개별 쿼리 금지).
  const [allGroups, counts, schedules, latestLogs, latestCompletedLogs, exams] = await Promise.all([
    getCurrentUserGroups(true),
    getAllGroupStudentCounts(),
    getCurrentUserSchedulesWithGroup(),
    getLatestLogPerGroup(false),
    getLatestLogPerGroup(true),
    getUpcomingGroupExams(today, addDaysStr(today, 14)),
  ]);

  // 최근 일지들의 출결 집계 (일지 id가 필요해서 위 결과 이후 1쿼리).
  const attendanceByLog = await getAttendanceSummaryForLogs(
    [...latestLogs.values()].map((log) => log.id),
  );

  const groups = allGroups.filter((group) => !group.archived);
  const archivedGroups = allGroups.filter((group) => group.archived);

  const schedulesByGroup = new Map<string, typeof schedules>();
  for (const slot of schedules) {
    schedulesByGroup.set(slot.group_id, [...(schedulesByGroup.get(slot.group_id) ?? []), slot]);
  }

  const nextByGroup = getGroupNextOccurrences(schedules, now);

  // 그룹별 가장 가까운 시험 1건 (start_date 오름차순이라 첫 항목이 가장 가깝다).
  const examByGroup = new Map<string, (typeof exams)[number]>();
  for (const exam of exams) {
    if (!examByGroup.has(exam.group_id)) {
      examByGroup.set(exam.group_id, exam);
    }
  }

  const weekEnd = addDaysStr(today, 7);

  const cards: GroupCardData[] = groups.map((group) => {
    const groupSlots = schedulesByGroup.get(group.id) ?? [];
    const scheduleLines = groupSchedulesByTime(groupSlots).map(
      (block) => `${formatDayList(block.days)} · ${block.startTime} ~ ${block.endTime}`,
    );

    const todaySlots = groupSlots.filter((slot) => slot.day_of_week === todayDow);
    const todayStart =
      todaySlots.length > 0
        ? todaySlots.map((slot) => formatTimeHM(slot.start_time)).sort()[0]
        : null;

    const occ = nextByGroup.get(group.id) ?? null;
    let nextLabel: string | null = null;
    let nextSub: string | null = null;

    if (occ) {
      nextLabel = formatNextLabel(occ);

      if (occ.isNow) {
        nextSub = `${occ.endTime}까지`;
      } else if (occ.daysFromNow === 0) {
        nextSub = formatRelative(Math.floor((occ.startEpoch - now.getTime()) / 60_000));
      }
    }

    const latest = latestLogs.get(group.id) ?? null;
    const completed = latestCompletedLogs.get(group.id) ?? null;
    const attendance = latest ? (attendanceByLog.get(latest.id) ?? null) : null;
    const attendanceParts = attendance
      ? [
          `출석 ${attendance.present}`,
          attendance.late > 0 ? `지각 ${attendance.late}` : null,
          attendance.absent > 0 ? `결석 ${attendance.absent}` : null,
        ].filter(Boolean)
      : [];

    const exam = examByGroup.get(group.id) ?? null;
    let examLabel: string | null = null;
    let examThisWeek = false;

    if (exam) {
      const inPeriod = exam.start_date <= today && today <= exam.end_date;
      const dday = daysBetween(today, exam.start_date);
      examLabel = inPeriod ? `${exam.title} · 시험 기간 중` : `${exam.title} D-${dday}`;
      examThisWeek = inPeriod || exam.start_date <= weekEnd;
    }

    const prepCount = activePreparationItems(group.preparation_items).filter(
      (item) => !item.completed,
    ).length;

    // 교재는 class_groups.textbook에 줄바꿈 구분으로 저장됨 (추가 쿼리 없음)
    const textbooks = (group.textbook ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      id: group.id,
      name: group.name,
      icon: group.icon ?? null,
      gradeLabel: formatGrade(group.grade),
      studentCount: counts.get(group.id) ?? 0,
      textbooks,
      scheduleLines,
      hasToday: todaySlots.length > 0,
      todayStart,
      isNow: occ?.isNow ?? false,
      nextLabel,
      nextSub,
      progressMain: completed?.default_progress?.trim() || completed?.title?.trim() || null,
      progressSub:
        completed?.default_progress?.trim() && completed?.title?.trim() ? completed.title.trim() : null,
      latestDateLabel: latest ? formatKoreanDate(latest.class_date) : null,
      latestStatus: latest?.status ?? null,
      attendanceLabel: attendanceParts.length > 0 ? attendanceParts.join(" · ") : null,
      prepCount,
      examLabel,
      examThisWeek,
      sortKey: occ ? occ.startEpoch : Number.MAX_SAFE_INTEGER,
      isNearest: false,
    };
  });

  // 가장 가까운 다음 수업을 가진 카드 1개만 살짝 강조
  const nearestKey = Math.min(...cards.map((card) => card.sortKey));
  if (Number.isFinite(nearestKey) && nearestKey !== Number.MAX_SAFE_INTEGER) {
    const nearest = cards.find((card) => card.sortKey === nearestKey);
    if (nearest) nearest.isNearest = true;
  }

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto max-w-[1000px]">
          <PageHeader title="수업 그룹" description="반별 수업 흐름과 준비 상태를 한눈에 확인해요." />

          {groups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-[#4c4c55]">
                <div>
                  아직 등록된 수업 그룹이 없어요.
                  <br />첫 반을 등록하고 수업 준비를 시작해볼까요?
                </div>
                <GroupCreateDialog label="첫 수업 그룹 등록하기" />
              </CardContent>
            </Card>
          ) : (
            <>
              <GroupsOverview groups={cards} />
              <div className="mt-6 flex justify-end">
                <GroupCreateDialog />
              </div>
            </>
          )}

          {archivedGroups.length > 0 ? (
            <details className="mt-8 pb-8">
              <summary className="cursor-pointer text-sm font-medium text-[#6b6b74]">
                보관된 그룹 {archivedGroups.length}개 보기
              </summary>
              <div className="mt-4 grid gap-3">
                {archivedGroups.map((group) => (
                  <Card key={group.id} className="p-4 opacity-80">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-[#232327]">{group.name}</div>
                        <div className="mt-0.5 text-xs text-[#8a8a93]">
                          {formatGrade(group.grade)}
                          {group.memo ? ` · ${group.memo}` : ""}
                        </div>
                      </div>
                      <form action={restoreGroupAction.bind(null, group.id)}>
                        <PendingButton variant="secondary" size="sm" pendingText="복원 중...">
                          복원
                        </PendingButton>
                      </form>
                    </div>
                  </Card>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
