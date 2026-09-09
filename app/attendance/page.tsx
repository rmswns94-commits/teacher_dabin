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

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_HEADERS_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const MONTH_NAMES_EN = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

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

          <Card>
            <CardContent className="p-4 md:p-6">
              {/* 플래너 스타일 헤더 (수업 일지 달력과 동일 계열) */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-end gap-3">
                    <span className="font-display text-5xl font-bold leading-none tracking-tight text-[#6d5aa8] md:text-6xl">
                      {month.slice(5)}
                    </span>
                    <div className="pb-0.5 leading-snug">
                      <div className="text-sm font-bold tracking-[0.14em] text-[#2d2928] md:text-base">
                        / {MONTH_NAMES_EN[Number(month.slice(5)) - 1]}
                      </div>
                      <div className="text-xs font-semibold tracking-[0.1em] text-[#a08d97] md:text-sm">
                        / {month.slice(0, 4)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1">
                    <Link
                      href={buildQuery({ month: addMonths(month, -1) })}
                      aria-label="이전 달"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#eee9f6] text-[#8a7b77] transition hover:bg-[#faf8ff]"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      href={buildQuery({ month: addMonths(month, 1) })}
                      aria-label="다음 달"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#eee9f6] text-[#8a7b77] transition hover:bg-[#faf8ff]"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      href={buildQuery({ month: currentMonth, date: today })}
                      className="rounded-xl border border-[#eee9f6] px-2.5 py-1.5 text-xs text-[#8a7b77] transition hover:bg-[#faf8ff] hover:text-[#564d4d]"
                    >
                      오늘
                    </Link>
                  </div>
                </div>
              </div>

              {/* 요일 헤더 */}
              <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-t-2xl border border-b-0 border-[#e3ddf1] bg-[#f7f4fd] text-center text-[11px] font-semibold md:text-xs">
                {WEEKDAY_HEADERS.map((day, headerIndex) => (
                  <div
                    key={day}
                    className={cn(
                      "border-l border-[#eee9f6] py-2 first:border-l-0",
                      headerIndex === 0
                        ? "text-[#c97a7a]"
                        : headerIndex === 6
                          ? "text-[#7a8fc9]"
                          : "text-[#6b6b74]",
                    )}
                  >
                    <span className="md:hidden">{day}</span>
                    <span className="max-md:hidden">{WEEKDAY_HEADERS_FULL[headerIndex]}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 overflow-hidden rounded-b-2xl border border-[#e3ddf1] bg-white">
                {weeks.flat().map((date, index) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className={cn(
                          "min-h-[84px] border-l border-t border-[#eee9f6] bg-[#fbfafd] md:min-h-[118px]",
                          index % 7 === 0 && "border-l-0",
                          index < 7 && "border-t-0",
                        )}
                      />
                    );
                  }

                  const counts = countsByDate.get(date);
                  const isSelected = date === selectedDate;
                  const isToday = date === today;
                  const dayNumber = Number(date.slice(8));
                  const columnIndex = index % 7;
                  const isSunday = columnIndex === 0;
                  const isSaturday = columnIndex === 6;

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
                        "flex min-h-[84px] flex-col border-l border-t border-[#eee9f6] p-1 pb-1.5 transition md:min-h-[118px] md:p-1.5",
                        columnIndex === 0 && "border-l-0",
                        index < 7 && "border-t-0",
                        isSunday && !isSelected && "bg-[#faf7f4]",
                        isSelected
                          ? "bg-[#f5f1fb] shadow-[inset_0_0_0_2px_#cfc4f0]"
                          : "hover:bg-[#faf8ff]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums md:h-6 md:w-6 md:text-xs",
                          isSunday
                            ? "text-[#c97a7a]"
                            : isSaturday
                              ? "text-[#7a8fc9]"
                              : "text-[#4a423f]",
                          isToday && "bg-[#8b7ae6] font-bold text-white",
                        )}
                      >
                        {dayNumber}
                      </span>

                      {counts ? (
                        <span aria-hidden className="mt-0.5 flex flex-col gap-px px-0.5 md:mt-1">
                          {ATTENDANCE_ORDER.filter((status) => counts[status] > 0).map(
                            (status) => (
                              <span
                                key={status}
                                className={cn(
                                  "text-[10px] font-medium leading-[15px] tabular-nums md:text-[11px] md:leading-4",
                                  countTextColors[status],
                                )}
                              >
                                <span className="md:hidden">
                                  {shortLabels[status]} {counts[status]}
                                </span>
                                <span className="max-md:hidden">
                                  {attendanceLabels[status]} {counts[status]}
                                </span>
                              </span>
                            ),
                          )}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>

              {entries.length === 0 ? (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-[#faf4ef] px-3 py-2.5 text-center text-xs text-[#8a7b77]">
                  <ClipboardCheck className="h-3.5 w-3.5 text-[#b9a2a8]" aria-hidden />
                  이번 달에는 아직 출결 기록이 없어요. 수업일지를 작성 완료하면 여기에 반영돼요.
                </div>
              ) : null}
            </CardContent>
          </Card>

          {selectedDate ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="font-display text-xl font-semibold text-[#2d2928]">
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
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
                              <span className="text-xs tabular-nums text-[#8a7b77]">
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
                                <span className="rounded-full bg-[#f2effc] px-2 py-0.5 text-[10px] text-[#5f54b8]">
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
