"use client";

// 정규수업 1회 변경 — [수업 변경] 하나로 들어가는 3단계 마법사.
//   1) 앞으로의 수업 목록에서 옮길 수업 선택
//   2) 캘린더에서 새 날짜 선택 (또는 이 수업만 휴강)
//   3) 시간 선택 → 저장
// 저장 결과는 1회 예외 row 하나뿐이다: 원래 날짜의 수업은 자동으로 사라지고(휴강),
// 옮긴 날짜에 그 시간으로 나타난다. 반복 시간표(class_group_schedules)는 절대 바뀌지 않는다.
//
// - 같은 날짜를 고르면 "시간만 변경"으로 저장된다(이동 row를 만들지 않는다).
// - 이미 일지(작성 중/완료)가 있는 날짜는 서버가 차단하고 안내만 한다 — 자동 삭제 없음.
// - 캘린더는 기존 date 계산 helper만 쓰는 순수 그리드다 (새 dependency 없음).

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, CalendarOff, ChevronLeft, ChevronRight, Clock, RotateCcw, X } from "lucide-react";

import {
  removeScheduleExceptionAction,
  saveScheduleExceptionAction,
} from "@/app/groups/exception-actions";
import { TimeSelect } from "@/components/time-select";
import { Button } from "@/components/ui/button";
import { addDaysStr } from "@/lib/calendar";
import { formatKoreanDate, formatShortDateWithWeekday } from "@/lib/dates";
import { DAY_LABELS, dayOfWeekOf, formatTimeHM } from "@/lib/schedule";
import {
  buildScheduleExceptionIndex,
  resolveOccurrence,
  validateScheduleException,
  type ScheduleExceptionEntry,
} from "@/lib/schedule-exceptions";
import { cn } from "@/lib/utils";

export type ExceptionScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

// 목록에 보여줄 앞으로의 수업 범위 (오늘 포함 2주)
const UPCOMING_DAYS = 14;

type Occurrence = {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
};

type Step = "list" | "date" | "time";

export function ScheduleExceptionManager({
  groupId,
  slots,
  exceptions,
  closedDates,
  holidayNamesByDate,
  today,
}: {
  groupId: string;
  slots: ExceptionScheduleSlot[];
  // 예정된 1회 변경 (원래 날짜 또는 옮긴 날짜가 오늘 이후)
  exceptions: ScheduleExceptionEntry[];
  // 학원 전체 휴강일 (앞으로 2주) — 그날은 수업이 없으므로 목록에서 빠지고 이동 대상도 아니다
  closedDates: string[];
  // 대한민국 공휴일 (앞으로 2주, 날짜 → 이름들) — 공휴일의 정규수업은 기본 휴강이라
  // 옮길 수업 목록에 나오면 안 된다. 다른 화면과 같은 판정을 쓰기 위해 함께 넘긴다.
  holidayNamesByDate?: Record<string, string[]>;
  today: string;
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [picked, setPicked] = useState<Occurrence | null>(null);
  const [targetDate, setTargetDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [monthAnchor, setMonthAnchor] = useState(today);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<ScheduleExceptionEntry | null>(null);
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);

  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const index = useMemo(
    () =>
      buildScheduleExceptionIndex(
        exceptions,
        closedDates,
        // 보강은 이 반의 "옮길 수업" 후보가 아니다 (1회성 수업이라 이동 대상이 아님).
        // 보강이 있는 날짜로의 이동은 서버가 같은 규칙(groupHasClassOn)으로 최종 차단한다.
        [],
        new Map(Object.entries(holidayNamesByDate ?? {})),
      ),
    [exceptions, closedDates, holidayNamesByDate],
  );
  const closedSet = useMemo(() => new Set(closedDates), [closedDates]);

  // 앞으로 2주간 이 반의 실제 수업 목록 (1회 변경이 이미 반영된 상태로 보여준다)
  const upcoming = useMemo(() => {
    const list: Occurrence[] = [];
    for (let offset = 0; offset < UPCOMING_DAYS; offset += 1) {
      const date = addDaysStr(today, offset);
      const dow = dayOfWeekOf(date);
      for (const slot of slots) {
        if (slot.dayOfWeek !== dow) continue;
        const effective = resolveOccurrence(index, slot.id, date, slot.startTime, slot.endTime);
        if (effective.cancelled) continue;
        list.push({
          scheduleId: slot.id,
          date,
          startTime: effective.startTime,
          endTime: effective.endTime,
        });
      }
      for (const moved of index.movedInByDate.get(date) ?? []) {
        const slot = slotById.get(moved.scheduleId);
        if (!slot || !moved.startTime || !moved.endTime) continue;
        list.push({
          scheduleId: slot.id,
          date,
          startTime: formatTimeHM(moved.startTime),
          endTime: formatTimeHM(moved.endTime),
        });
      }
    }
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [slots, today, index, slotById]);

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, 4000);
  };

  const openWizard = () => {
    setPicked(null);
    setTargetDate("");
    setError("");
    setMonthAnchor(today);
    setStep("list");
  };

  // 마법사 전체 종료. 저장하지 않은 선택(고른 수업/날짜)은 버린다 — DB는 건드리지 않는다.
  // 다시 열 때는 openWizard가 현재 저장 상태 기준으로 처음부터 시작한다.
  const closeWizard = () => {
    if (busyRef.current) return;
    setStep(null);
    setPicked(null);
    setTargetDate("");
    setError("");
  };

  const pickOccurrence = (occurrence: Occurrence) => {
    setPicked(occurrence);
    setTargetDate(occurrence.date);
    setStartTime(occurrence.startTime);
    setEndTime(occurrence.endTime);
    setMonthAnchor(occurrence.date);
    setError("");
    setStep("date");
  };

  // 예외 row의 identity는 언제나 "원래 날짜"다. 이미 옮겨온 수업을 다시 옮길 때는
  // 화면에 보이는 날짜가 아니라 그 예외의 원래 날짜를 기준으로 저장해야 row가 하나로 유지된다.
  const movedEntryOf = (occurrence: Occurrence) =>
    exceptions.find(
      (entry) =>
        entry.kind === "moved" &&
        entry.scheduleId === occurrence.scheduleId &&
        entry.movedToDate === occurrence.date,
    ) ?? null;

  // 변경 내역 한 줄 요약 — 저장된 예외 row와 반복 시간표에서만 만든다.
  // "기존"은 그 occurrence의 원래 날짜 + 반복 시간표 시각, "변경"은 예외에 저장된 날짜/시각이다
  // (화면 문구를 다시 파싱하지 않는다).
  const summaryOf = (entry: ScheduleExceptionEntry) => {
    const base = slotById.get(entry.scheduleId);
    const from = base
      ? `${formatShortDateWithWeekday(entry.date)} ${formatTimeHM(base.startTime)}~${formatTimeHM(base.endTime)}`
      : formatShortDateWithWeekday(entry.date);

    if (entry.kind === "cancelled") {
      return { from, to: null };
    }

    const toDate = entry.kind === "moved" ? entry.movedToDate ?? entry.date : entry.date;
    return { from, to: `${formatShortDateWithWeekday(toDate)} ${entry.startTime}~${entry.endTime}` };
  };

  // 이 반 수업이 이미 있는 날짜 — 수업일지가 반·날짜마다 하나라서 그런 날로는 옮길 수 없다
  // (판정 규칙은 서버가 최종적으로 다시 확인한다). 고른 수업 자신의 날짜는 "시간만 변경"이라 제외.
  const occupiedDates = useMemo(() => {
    if (!picked) return new Set<string>();
    return new Set(
      upcoming.filter((occurrence) => occurrence.date !== picked.date).map((o) => o.date),
    );
  }, [upcoming, picked]);

  const slot = picked ? slotById.get(picked.scheduleId) ?? null : null;
  const movedEntry = picked ? movedEntryOf(picked) : null;
  const originDate = movedEntry ? movedEntry.date : picked?.date ?? "";

  const validationError =
    picked && slot
      ? validateScheduleException({
          kind: targetDate === originDate ? "time_override" : "moved",
          date: originDate,
          movedToDate: targetDate,
          originAlreadyMoved: Boolean(movedEntry),
          scheduleDayOfWeek: slot.dayOfWeek,
          baseStartTime: slot.startTime,
          baseEndTime: slot.endTime,
          startTime,
          endTime,
          today,
          dayOfWeekOfDate: dayOfWeekOf,
        })
      : "수업을 먼저 선택해주세요.";

  // 시작 시간을 바꾸면 수업 길이는 그대로 따라간다 (90분 수업을 14:00으로 옮기면 15:30).
  // 종료 시간을 직접 고르면 그 값이 그대로 쓰인다.
  const shiftStartKeepingDuration = (nextStart: string) => {
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const duration = toMinutes(endTime) - toMinutes(startTime);
    setStartTime(nextStart);

    if (duration <= 0) {
      return;
    }

    const end = toMinutes(nextStart) + duration;
    if (end >= 24 * 60) {
      return; // 자정을 넘기면 종료 시간은 사용자가 직접 고르게 둔다
    }

    setEndTime(
      `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    );
  };

  const save = (kind: "moved" | "time_override" | "cancelled") => {
    if (busyRef.current || !picked || !slot) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await saveScheduleExceptionAction({
          groupId,
          scheduleId: picked.scheduleId,
          date: originDate,
          kind,
          startTime: kind === "cancelled" ? undefined : startTime,
          endTime: kind === "cancelled" ? undefined : endTime,
          movedToDate: kind === "moved" ? targetDate : undefined,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setStep(null);
        showNotice(
          kind === "cancelled"
            ? `${formatKoreanDate(originDate)} 수업을 휴강 처리했어요.`
            : kind === "time_override"
              ? `${formatKoreanDate(originDate)} 수업 시간을 변경했어요.`
              : `${formatKoreanDate(originDate)} 수업을 ${formatKoreanDate(targetDate)} ${startTime}으로 옮겼어요.`,
        );
      } finally {
        busyRef.current = false;
      }
    });
  };

  const restore = (entry: ScheduleExceptionEntry) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await removeScheduleExceptionAction({
          groupId,
          exceptionId: entry.id,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setConfirmRestore(null);
        showNotice("수업 변경을 되돌렸어요.");
      } finally {
        busyRef.current = false;
      }
    });
  };

  // ── 캘린더 그리드 (월 단위, 순수 계산) ──
  const monthStart = `${monthAnchor.slice(0, 7)}-01`;
  const monthLabel = `${Number(monthAnchor.slice(0, 4))}년 ${Number(monthAnchor.slice(5, 7))}월`;
  const leading = dayOfWeekOf(monthStart);
  const daysInMonth = new Date(
    Date.UTC(Number(monthAnchor.slice(0, 4)), Number(monthAnchor.slice(5, 7)), 0),
  ).getUTCDate();
  const calendarCells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDaysStr(monthStart, i)),
  ];
  const shiftMonth = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? addDaysStr(`${monthAnchor.slice(0, 7)}-28`, 7)
        : addDaysStr(monthStart, -1);
    setMonthAnchor(`${next.slice(0, 7)}-01`);
  };

  if (slots.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openWizard}>
          <Clock className="h-3.5 w-3.5" aria-hidden /> 수업 변경
        </Button>
        <span className="secondary-text text-[#a89a95]">
          특정 날짜 수업만 다른 날·다른 시간으로 옮기거나 휴강할 수 있어요.
        </span>
      </div>

      {notice ? (
        <p role="status" className="mt-2 rounded-xl border border-[#d8ebe0] bg-[#f0faf5] px-3 py-2 text-sm text-[#2f6d54]">
          {notice}
        </p>
      ) : null}
      {error && step === null && !confirmRestore ? (
        <p role="status" className="mt-2 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
          {error}
        </p>
      ) : null}

      {/* 저장된 수업 변경 — 한 줄 요약 + 되돌리기 (좁으면 자연스럽게 줄바꿈, 정보는 숨기지 않는다) */}
      {exceptions.length > 0 ? (
        <div className="mt-3">
          <ul className="space-y-1.5" aria-label="예정된 수업 변경">
            {exceptions.map((entry) => {
              const summary = summaryOf(entry);
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-[#e8e2f5] bg-[#f8f6fc] px-3 py-2"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="tabular-nums text-[#6b6b74]">
                      <span className="sr-only">기존 </span>
                      {summary.from}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#a99cd4]" aria-hidden />
                    {summary.to ? (
                      <span className="tabular-nums font-semibold text-[#5d4ba5]">
                        <span className="sr-only">변경 </span>
                        {summary.to}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#96534c]">😴 휴강</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    disabled={isPending}
                    onClick={() => setConfirmRestore(entry)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 되돌리기
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="caption-text mt-1.5 text-[#a89a95]">
            반복 시간표를 수정하면 예정된 수업 변경은 사라져요.
          </p>
        </div>
      ) : null}

      {/* 마법사 */}
      {step ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="수업 변경"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeWizard();
            }
          }}
        >
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            {/* 제목 + 닫기. X는 "이전 단계"가 아니라 마법사 전체 종료다 (저장 없음). */}
            <div className="flex items-start justify-between gap-3">
              <div className="card-title min-w-0 text-[#2a2323]">
                {step === "list" ? "어떤 수업을 변경할까요?" : step === "date" ? "언제로 옮길까요?" : "몇 시에 할까요?"}
              </div>
              <button
                type="button"
                onClick={closeWizard}
                disabled={isPending}
                aria-label="수업 변경 닫기"
                className="-mr-1.5 -mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8a7b77] transition hover:bg-[#faf0f2] disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {step === "list" ? (
              <>
                <p className="mt-1 text-sm leading-5 text-[#8a7b77]">
                  앞으로 2주 동안의 수업이에요. 변경할 수업을 선택해주세요.
                </p>
                <ul className="mt-3 space-y-1.5" aria-label="변경할 수업 목록">
                  {upcoming.length === 0 ? (
                    <li className="rounded-xl bg-[#faf4ef] px-3 py-3 text-sm text-[#8a7b77]">
                      앞으로 2주 동안 예정된 수업이 없어요.
                    </li>
                  ) : (
                    upcoming.map((occurrence) => (
                      <li key={`${occurrence.scheduleId}-${occurrence.date}`}>
                        <button
                          type="button"
                          onClick={() => pickOccurrence(occurrence)}
                          className="flex min-h-[46px] w-full items-center justify-between gap-2 rounded-xl border border-[#f0e6e0] bg-white px-3 py-2 text-left transition hover:border-[#d8cdf0] hover:bg-[#faf7ff]"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#2d2928]">
                              {formatKoreanDate(occurrence.date, true)}
                            </span>
                            <span className="secondary-text block tabular-nums text-[#8a7b77]">
                              {occurrence.startTime} ~ {occurrence.endTime}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#c4b6b0]" aria-hidden />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="mt-4">
                  <Button type="button" variant="secondary" className="w-full" onClick={closeWizard}>
                    닫기
                  </Button>
                </div>
              </>
            ) : null}

            {step === "date" && picked ? (
              <>
                <p className="mt-1 text-sm leading-5 text-[#8a7b77]">
                  {formatKoreanDate(picked.date, true)} {picked.startTime} 수업을 옮길 날짜를
                  선택해주세요. 원래 날짜는 자동으로 휴강 처리돼요.
                </p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label="이전 달">
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="card-title tabular-nums text-[#2a2323]">{monthLabel}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label="다음 달">
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="grid" aria-label="옮길 날짜 선택">
                  {DAY_LABELS.map((label) => (
                    <span key={label} className="caption-text py-1 text-[#a89a95]">
                      {label}
                    </span>
                  ))}
                  {calendarCells.map((date, cellIndex) => {
                    if (!date) {
                      return <span key={`empty-${cellIndex}`} />;
                    }
                    const closed = closedSet.has(date);
                    const occupied = occupiedDates.has(date);
                    const disabled = date < today || occupied || closed;
                    const selected = date === targetDate;
                    return (
                      <button
                        key={date}
                        type="button"
                        disabled={disabled}
                        aria-pressed={selected}
                        aria-label={
                          closed
                            ? `${formatKoreanDate(date)} — 학원 휴강일이에요`
                            : occupied
                              ? `${formatKoreanDate(date)} — 이 반 수업이 이미 있어요`
                              : formatKoreanDate(date)
                        }
                        onClick={() => setTargetDate(date)}
                        className={cn(
                          "min-h-[38px] rounded-xl border text-sm tabular-nums transition",
                          disabled
                            ? "cursor-not-allowed border-transparent text-[#d8cfcb]"
                            : selected
                              ? "border-[#d8cdf0] bg-[#f3eefc] font-semibold text-[#5d4ba5]"
                              : "border-[#f0e6e0] bg-white text-[#564d4d] hover:bg-[#faf7ff]",
                        )}
                      >
                        {Number(date.slice(8))}
                      </button>
                    );
                  })}
                </div>

                <p className="caption-text mt-2 text-[#a89a95]">
                  회색 날짜는 이미 지났거나, 이 반 수업이 이미 있거나, 학원 휴강일이에요.
                </p>

                {error ? (
                  <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                    {error}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep("list")}>
                    이전
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!targetDate}
                    onClick={() => {
                      setError("");
                      setStep("time");
                    }}
                  >
                    다음
                  </Button>
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1.5 text-[#96534c]"
                    disabled={isPending}
                    onClick={() => save("cancelled")}
                  >
                    <CalendarOff className="h-4 w-4" aria-hidden />
                    {isPending ? "처리 중…" : "옮기지 않고 이 수업 휴강하기"}
                  </Button>
                </div>
              </>
            ) : null}

            {step === "time" && picked ? (
              <>
                <p className="mt-1 text-sm leading-5 text-[#8a7b77]">
                  {formatKoreanDate(targetDate, true)}에 진행할 시간을 선택해주세요.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <TimeSelect
                    value={startTime}
                    onChange={shiftStartKeepingDuration}
                    ariaLabel="변경할 시작 시간"
                    bound="start"
                    className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
                  />
                  <span className="text-sm text-[#8a7b77]">~</span>
                  <TimeSelect
                    value={endTime}
                    onChange={setEndTime}
                    ariaLabel="변경할 종료 시간"
                    bound="end"
                    minTime={startTime}
                    className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
                  />
                </div>

                <div className="mt-3 rounded-xl bg-[#f8f6fc] px-3 py-2 text-sm text-[#564d4d]">
                  {formatKoreanDate(originDate, true)} {picked.startTime} →{" "}
                  <span className="font-semibold text-[#5d4ba5]">
                    {formatKoreanDate(targetDate, true)} {startTime} ~ {endTime}
                  </span>
                </div>

                {error ? (
                  <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                    {error}
                  </p>
                ) : validationError ? (
                  <p className="mt-3 text-sm text-[#a89a95]">{validationError}</p>
                ) : null}

                <div className="mt-4 flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep("date")}>
                    이전
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={isPending || Boolean(validationError)}
                    onClick={() => save(targetDate === originDate ? "time_override" : "moved")}
                  >
                    {isPending ? "저장 중…" : "이 날짜로 변경"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 원래대로 확인 */}
      {confirmRestore ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="수업 변경 되돌리기 확인"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              event.stopPropagation();
              setConfirmRestore(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">수업 변경을 되돌릴까요?</div>
            <p className="mt-2 text-sm leading-5 text-[#655d5d]">
              {confirmRestore.kind === "cancelled"
                ? `${summaryOf(confirmRestore).from} 휴강을 취소하고 원래 일정으로 되돌립니다.`
                : confirmRestore.kind === "moved"
                  ? `${summaryOf(confirmRestore).to}으로 옮긴 수업을 취소하고 원래 일정인 ${summaryOf(confirmRestore).from}으로 되돌립니다.`
                  : `${summaryOf(confirmRestore).to}으로 바꾼 시간을 취소하고 원래 일정인 ${summaryOf(confirmRestore).from}으로 되돌립니다.`}
            </p>
            <p className="mt-1 text-sm leading-5 text-[#8a7b77]">
              이 변경만 사라지고, 반복 시간표는 그대로예요.
            </p>
            {error ? (
              <p role="status" className="mt-2 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={() => setConfirmRestore(null)}
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={isPending}
                onClick={() => restore(confirmRestore)}
              >
                {isPending ? "되돌리는 중…" : "되돌리기"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
