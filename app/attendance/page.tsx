import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { AttendanceExcelButton } from "@/components/attendance-excel-export";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ATTENDANCE_ORDER,
  attendanceLabels,
  countAttendanceByDate,
  emptyAttendanceCounts,
  groupStartSortKey,
  groupTimeLabelOf,
  slotsByGroupOf,
  type AttendanceEntry,
} from "@/lib/attendance";
import {
  addMonths,
  buildMonthGrid,
  dayOfWeekOf,
  monthLabel,
  monthRange,
  parseMonthParam,
} from "@/lib/calendar";
import { formatKoreanDate, todayDateString } from "@/lib/dates";
import { gradeDisplay } from "@/lib/grades";
import { groupIconOf } from "@/lib/group-icons";
import { compareKoreanName, sortByKoreanName } from "@/lib/korean-sort";
import { getMonthlyAttendanceEntries } from "@/lib/supabase/queries/attendance";
import { getCurrentUserSchedulesWithGroup } from "@/lib/supabase/queries/schedules";
import type { AttendanceStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// 스프링 노트 달력 디자인 (오늘 할 일/시험 대비 플래너와 동일 계열): 일요일 시작 SUN~SAT, 주말 웜 레드
const WEEKDAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKEND_TEXT = "text-[#d95f4c]";
const NAV_BUTTON =
  "flex h-9 min-w-9 items-center justify-center rounded-xl border border-[#c9dcee] bg-white px-2 text-sm font-medium text-[#4a6f96] transition hover:bg-[#f3f8fd]";

// 상단 스프링 코일 장식 (오늘 할 일 캘린더와 동일 — 순수 decoration)
function SpringCoils() {
  return (
    <div aria-hidden className="pointer-events-none absolute -top-3.5 left-0 right-0 flex justify-around px-5">
      {Array.from({ length: 11 }, (_, i) => (
        <span
          key={i}
          className="h-7 w-2.5 rounded-full border border-[#a9c8e4] bg-gradient-to-b from-[#dcecf9] to-[#aecde9] shadow-[0_1px_2px_rgba(120,150,180,0.35)]"
        />
      ))}
    </div>
  );
}

// 달력 셀의 상태별 표시 색 (배지/칩과 같은 계열)
const countTextColors: Record<AttendanceStatus, string> = {
  present: "text-[#3d7f64]",
  late: "text-[#94702f]",
  early_leave: "text-[#614ea7]",
  absent: "text-[#a26660]",
};

const countChipStyles: Record<AttendanceStatus, string> = {
  present: "bg-[#e4f4ec] text-[#3d7f64]",
  late: "bg-[#fdf3e4] text-[#94702f]",
  early_leave: "bg-[#f3eefc] text-[#614ea7]",
  absent: "bg-[#f9e7e5] text-[#a26660]",
};

// 셀 좁은 화면용 축약 라벨 (출3 · 지1 · 조1 · 결2)
const shortLabels: Record<AttendanceStatus, string> = {
  present: "출",
  late: "지",
  early_leave: "조",
  absent: "결",
};

function buildQuery(params: { month: string; date?: string | null }) {
  const query = new URLSearchParams();
  query.set("month", params.month);
  if (params.date) query.set("date", params.date);
  return `/attendance?${query.toString()}`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string; date?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);

  const month = parseMonthParam(params.month, currentMonth);
  const range = monthRange(month);

  // 월간 출결은 배치 1쿼리 — 화면과 Excel(/attendance/export)이 같은 소스를 쓴다
  const [entries, schedules] = await Promise.all([
    getMonthlyAttendanceEntries(range.start, range.end),
    getCurrentUserSchedulesWithGroup(),
  ]);

  const slotsByGroup = slotsByGroupOf(schedules);
  const countsByDate = countAttendanceByDate(entries);

  const dateParamValid = params.date && params.date.slice(0, 7) === month ? params.date : null;
  const selectedDate = dateParamValid ?? (month === currentMonth ? today : null);

  // 선택 날짜의 상세: 반별(그 요일 수업 시작 시간 ASC → 반 이름) → 학생 가나다순
  const selectedEntries = selectedDate
    ? entries.filter((entry) => entry.classDate === selectedDate)
    : [];
  const selectedCounts = selectedDate
    ? (countsByDate.get(selectedDate) ?? emptyAttendanceCounts())
    : emptyAttendanceCounts();

  const byGroup = new Map<string, AttendanceEntry[]>();
  for (const entry of selectedEntries) {
    byGroup.set(entry.groupId, [...(byGroup.get(entry.groupId) ?? []), entry]);
  }
  const selectedDow = selectedDate ? dayOfWeekOf(selectedDate) : undefined;
  const groupSections = [...byGroup.entries()]
    .map(([groupId, groupEntries]) => ({
      groupId,
      groupName: groupEntries[0].groupName,
      groupIcon: groupEntries[0].groupIcon,
      timeLabel: groupTimeLabelOf(slotsByGroup.get(groupId)),
      startSort: groupStartSortKey(slotsByGroup.get(groupId), selectedDow),
      students: sortByKoreanName(
        groupEntries,
        (entry) => entry.studentName,
        (entry) => entry.studentId,
      ),
    }))
    .sort(
      (a, b) =>
        a.startSort.localeCompare(b.startSort) || compareKoreanName(a.groupName, b.groupName),
    );

  const weeks = buildMonthGrid(month);

  return (
    <AppShell>
      <main className="h-screen overflow-y-auto px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-[1150px]">
          <PageHeader
            title="출결 현황"
            description="수업일지에 기록한 출결을 달력에서 한눈에 보고, 월간 출석부를 엑셀로 내보낼 수 있어요."
            action={<AttendanceExcelButton month={month} hasData={entries.length > 0} />}
          />

          {/* ── 월간 캘린더 (오늘 할 일/시험 대비 플래너와 동일한 스프링 노트 디자인) ── */}
          <section
            aria-label="출결 월간 캘린더"
            className="mb-5 rounded-3xl border border-[#d5e6f3] bg-gradient-to-b from-[#e2f0fa] via-[#edf5fb] to-[#eef6ef] p-3 shadow-sm sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-1">
              <h2 className="card-title text-[#2b2323]">
                {monthLabel(month)}
              </h2>
              <div className="flex items-center gap-1">
                <Link
                  href={buildQuery({ month: addMonths(month, -1) })}
                  aria-label="이전 달"
                  className={NAV_BUTTON}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                <Link href={buildQuery({ month: currentMonth, date: today })} className={NAV_BUTTON}>
                  오늘
                </Link>
                <Link
                  href={buildQuery({ month: addMonths(month, 1) })}
                  aria-label="다음 달"
                  className={NAV_BUTTON}
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* 스프링 노트 sheet — 코일 장식이 상단에 걸리도록 위 여백 확보 */}
            <div className="relative mt-4 rounded-2xl border border-[#dfe7ef] bg-white px-1.5 pb-2 pt-6 shadow-[0_12px_28px_rgba(120,150,180,0.14)] sm:px-2">
              <SpringCoils />

              {/* 요일 헤더 (일요일 시작 — SUN/SAT 웜 레드) */}
              <div className="grid grid-cols-7 border-b-2 border-[#eef1f5] pb-2">
                {WEEKDAY_HEADERS.map((label, index) => (
                  <div
                    key={label}
                    className={cn(
                      "px-1 text-center text-xs font-semibold tracking-[0.04em]",
                      index === 0 || index === 6 ? WEEKEND_TEXT : "text-[#4a4a55]",
                    )}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7">
                  {week.map((date, dayIndex) => {
                    if (!date) {
                      return (
                        <div
                          key={`empty-${dayIndex}`}
                          className="min-h-[76px] border-b border-r border-[#eef1f5] bg-[#f8fafc]/70 first:border-l sm:min-h-[92px]"
                        />
                      );
                    }

                    const counts = countsByDate.get(date);
                    const isSelected = date === selectedDate;
                    const isToday = date === today;
                    const isWeekend = dayIndex === 0 || dayIndex === 6;

                    const countParts = counts
                      ? ATTENDANCE_ORDER.filter((status) => counts[status] > 0).map(
                          (status) => `${attendanceLabels[status]} ${counts[status]}명`,
                        )
                      : [];
                    const label = [
                      formatKoreanDate(date),
                      countParts.length > 0 ? countParts.join(", ") : "출결 기록 없음",
                    ].join(", ");

                    return (
                      <Link
                        key={date}
                        href={buildQuery({ month, date })}
                        aria-label={label}
                        aria-current={isSelected ? "date" : undefined}
                        className={cn(
                          "min-h-[76px] min-w-0 border-b border-r border-[#eef1f5] px-0.5 py-1 transition first:border-l sm:min-h-[92px]",
                          "bg-white hover:bg-[#f7fafd]",
                          isSelected && "ring-1 ring-inset ring-[#a9c8e8]",
                        )}
                      >
                        {/* 날짜 숫자 가운데 정렬 — 플래너/오늘 할 일과 동일 */}
                        <div className="flex min-w-0 flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                              isToday
                                ? "bg-[#8b7ae6] text-white"
                                : isWeekend
                                  ? WEEKEND_TEXT
                                  : "text-[#3f3f49]",
                            )}
                          >
                            {Number(date.slice(8))}
                          </span>
                          {counts ? (
                            <span aria-hidden className="flex w-full min-w-0 flex-col items-center gap-px">
                              {ATTENDANCE_ORDER.filter((status) => counts[status] > 0).map(
                                (status) => (
                                  <span
                                    key={status}
                                    className={cn(
                                      "max-w-full truncate text-sm font-semibold leading-tight tabular-nums sm:text-sm sm:leading-5",
                                      countTextColors[status],
                                    )}
                                  >
                                    <span className="sm:hidden">
                                      {shortLabels[status]} {counts[status]}
                                    </span>
                                    <span className="hidden sm:inline">
                                      {attendanceLabels[status]} {counts[status]}
                                    </span>
                                  </span>
                                ),
                              )}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}

              {/* 하단 꽃 장식 (오늘 할 일 캘린더와 동일한 마무리) */}
              <div aria-hidden className="flex items-center justify-center gap-2 pt-2 text-sm">
                <span>🌼</span>
                <span>🌿</span>
                <span>🌼</span>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5 text-center text-sm text-[#6c7f92]">
                <ClipboardCheck className="h-3.5 w-3.5 text-[#8fabc6]" aria-hidden />
                이번 달에는 아직 출결 기록이 없어요. 수업일지를 작성 완료하면 여기에 반영돼요.
              </div>
            ) : null}
          </section>

          {selectedDate ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="card-title text-[#2d2928]">
                  {formatKoreanDate(selectedDate, true)}
                </h2>
                {selectedEntries.length > 0 ? (
                  <span className="text-sm text-[#8a7b77]">학생 {selectedEntries.length}명</span>
                ) : null}
              </div>

              {selectedEntries.length === 0 ? (
                <Card className="mt-3">
                  <CardContent className="p-5 text-sm text-[#655d5d]">
                    이 날짜에는 작성 완료된 수업 기록이 없어요. 출결은 수업일지를 작성 완료하면
                    반영돼요.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                    {ATTENDANCE_ORDER.map((status) => (
                      <span
                        key={status}
                        className={cn(
                          "rounded-full px-2 py-1 tabular-nums",
                          countChipStyles[status],
                        )}
                      >
                        {attendanceLabels[status]} {selectedCounts[status]}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 space-y-3">
                    {groupSections.map((section) => (
                      <Card key={section.groupId}>
                        <CardContent className="p-4 md:p-5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="flex items-center gap-1.5 font-semibold text-[#2d2928]">
                              <span aria-hidden>{groupIconOf(section.groupIcon)}</span>
                              {section.groupName}
                            </span>
                            {section.timeLabel ? (
                              <span className="text-sm tabular-nums text-[#8a7b77]">
                                {section.timeLabel}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 divide-y divide-dashed divide-[#f0eae4]">
                            {section.students.map((entry) => (
                              <div
                                key={entry.studentId}
                                className="flex flex-wrap items-center gap-2 py-2"
                              >
                                <span className="font-medium text-[#2d2928]">
                                  {entry.studentName}
                                </span>
                                <span className="rounded-full bg-[#f2effc] px-2 py-0.5 text-xs text-[#5f54b8]">
                                  {gradeDisplay[entry.studentGrade as keyof typeof gradeDisplay] ??
                                    entry.studentGrade}
                                </span>
                                <span className="ml-auto">
                                  <AttendanceBadge status={entry.attendance} />
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mt-6 text-center text-sm text-[#8a7b77]">
              달력에서 날짜를 선택하면 그날의 출결 상세를 볼 수 있어요.
            </div>
          )}

          <div className="pb-10" />
        </div>
      </main>
    </AppShell>
  );
}
