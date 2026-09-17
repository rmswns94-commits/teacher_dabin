"use client";

// 정규수업 1회 변경(휴강/시간 변경) — 그룹 상세의 시간표 영역 보조 UI.
//
// 원칙:
// - 반복 시간표 수정([수업 시간] 편집)과 완전히 구분된다. 여기서는 "특정 날짜 1회"만 바꾼다.
// - 저장은 명시적 [변경 적용] 클릭에서만. 날짜/요일/시간 검증은 서버와 같은 순수 helper
//   (lib/schedule-exceptions)를 써서 규칙이 두 벌이 되지 않게 한다.
// - 이미 일지가 있는 날짜는 서버가 차단하고, 그 안내를 그대로 보여준다 (자동 삭제 없음).
// - 시간 입력은 기존 5분 단위 공용 TimeSelect 재사용 (새 time picker/캘린더 의존성 없음).

import { useMemo, useRef, useState, useTransition } from "react";
import { CalendarOff, Clock, RotateCcw } from "lucide-react";

import {
  removeScheduleExceptionAction,
  saveScheduleExceptionAction,
} from "@/app/groups/exception-actions";
import { TimeSelect } from "@/components/time-select";
import { Button } from "@/components/ui/button";
import { formatKoreanDate } from "@/lib/dates";
import { DAY_LABELS, dayOfWeekOf, formatTimeHM } from "@/lib/schedule";
import {
  validateScheduleException,
  type ScheduleExceptionEntry,
  type ScheduleExceptionKind,
} from "@/lib/schedule-exceptions";
import { cn } from "@/lib/utils";

export type ExceptionScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export function ScheduleExceptionManager({
  groupId,
  slots,
  exceptions,
  today,
}: {
  groupId: string;
  slots: ExceptionScheduleSlot[];
  // 오늘 이후(예정된) 1회 변경 — 날짜 ASC
  exceptions: ScheduleExceptionEntry[];
  today: string;
}) {
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [kind, setKind] = useState<ScheduleExceptionKind>("cancelled");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<ScheduleExceptionEntry | null>(null);
  const [isPending, startTransition] = useTransition();
  const busyRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);

  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const openSlot = openSlotId ? slotById.get(openSlotId) ?? null : null;

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

  // 해당 요일의 가장 가까운 미래 날짜 (기본값 — 사용자가 바꿀 수 있다)
  const nextDateForDay = (dayOfWeek: number) => {
    for (let offset = 0; offset <= 14; offset += 1) {
      const candidate = new Date(`${today}T12:00:00Z`);
      candidate.setUTCDate(candidate.getUTCDate() + offset);
      const ymd = candidate.toISOString().slice(0, 10);
      if (dayOfWeekOf(ymd) === dayOfWeek) {
        return ymd;
      }
    }
    return today;
  };

  const openDialog = (slot: ExceptionScheduleSlot) => {
    setOpenSlotId(slot.id);
    setKind("cancelled");
    setDate(nextDateForDay(slot.dayOfWeek));
    setStartTime(formatTimeHM(slot.startTime));
    setEndTime(formatTimeHM(slot.endTime));
    setError("");
  };

  const closeDialog = () => {
    if (busyRef.current) return;
    setOpenSlotId(null);
    setError("");
  };

  const validationError = openSlot
    ? validateScheduleException({
        kind,
        date,
        scheduleDayOfWeek: openSlot.dayOfWeek,
        baseStartTime: openSlot.startTime,
        baseEndTime: openSlot.endTime,
        startTime,
        endTime,
        today,
        dayOfWeekOfDate: dayOfWeekOf,
      })
    : "수업 시간을 선택해주세요.";

  const submit = () => {
    if (busyRef.current || !openSlot || validationError) {
      return;
    }
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await saveScheduleExceptionAction({
          groupId,
          scheduleId: openSlot.id,
          date,
          kind,
          startTime: kind === "time_override" ? startTime : undefined,
          endTime: kind === "time_override" ? endTime : undefined,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setOpenSlotId(null);
        showNotice(
          kind === "cancelled"
            ? `${formatKoreanDate(date)} 수업을 휴강 처리했어요.`
            : `${formatKoreanDate(date)} 수업 시간을 변경했어요.`,
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
          date: entry.date,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setConfirmRestore(null);
        showNotice(`${formatKoreanDate(entry.date)} 수업을 원래 시간표대로 되돌렸어요.`);
      } finally {
        busyRef.current = false;
      }
    });
  };

  if (slots.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[#8a7b77]">특정 날짜만 바꾸려면</span>
        {slots.map((slot) => (
          <Button
            key={slot.id}
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-[#6652b9]"
            onClick={() => openDialog(slot)}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {DAY_LABELS[slot.dayOfWeek]} {formatTimeHM(slot.startTime)} 1회 변경
          </Button>
        ))}
      </div>

      {notice ? (
        <p role="status" className="mt-2 rounded-xl border border-[#d8ebe0] bg-[#f0faf5] px-3 py-2 text-sm text-[#2f6d54]">
          {notice}
        </p>
      ) : null}
      {error && !openSlotId && !confirmRestore ? (
        <p role="status" className="mt-2 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
          {error}
        </p>
      ) : null}

      {/* 예정된 1회 변경 — 날짜 ASC, 지난 변경은 표시하지 않는다(기록은 삭제하지 않음) */}
      {exceptions.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-[#efe4dc] bg-[#fffdfb] p-3">
          <div className="text-sm font-semibold text-[#4d3a3a]">예정된 1회 변경</div>
          <ul className="mt-2 space-y-1.5">
            {exceptions.map((entry) => {
              const slot = slotById.get(entry.scheduleId);
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#faf7f3] px-3 py-2"
                >
                  <span className="min-w-0 text-sm text-[#564d4d]">
                    <span className="font-medium text-[#2d2928]">
                      {formatKoreanDate(entry.date, true)}
                    </span>{" "}
                    {entry.kind === "cancelled" ? (
                      <span className="text-[#a05252]">휴강</span>
                    ) : (
                      <span className="tabular-nums">
                        {slot ? `${formatTimeHM(slot.startTime)} → ` : ""}
                        {entry.startTime} ~ {entry.endTime}
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-[#7c6d69]"
                    disabled={isPending}
                    onClick={() => setConfirmRestore(entry)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 원래대로
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="caption-text mt-2 text-[#a89a95]">
            반복 시간표를 수정하면 예정된 1회 변경은 사라져요.
          </p>
        </div>
      ) : null}

      {/* 1회 변경 dialog */}
      {openSlot ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="정규수업 1회 변경"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeDialog();
            }
          }}
        >
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">정규수업 1회 변경</div>
            <p className="mt-1 text-sm leading-5 text-[#8a7b77]">
              매주 {DAY_LABELS[openSlot.dayOfWeek]}요일 {formatTimeHM(openSlot.startTime)} ~{" "}
              {formatTimeHM(openSlot.endTime)} 수업의 선택한 날짜 하루만 바뀌어요. 반복 시간표는
              그대로예요.
            </p>

            <label className="mt-3 block">
              <span className="form-label mb-1.5 block font-semibold text-[#7c6d69]">적용 날짜</span>
              <input
                type="date"
                value={date}
                min={today}
                onChange={(event) => setDate(event.target.value)}
                aria-label="1회 변경 적용 날짜"
                className="min-h-[42px] w-full min-w-0 rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none focus:border-[#c9b9e8]"
              />
            </label>

            <div className="mt-3" role="radiogroup" aria-label="변경 종류">
              <span className="form-label mb-1.5 block font-semibold text-[#7c6d69]">변경 종류</span>
              <div className="flex gap-1.5">
                {[
                  { value: "cancelled" as const, label: "휴강", icon: CalendarOff },
                  { value: "time_override" as const, label: "시간 변경", icon: Clock },
                ].map((option) => {
                  const Icon = option.icon;
                  const selected = kind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setKind(option.value)}
                      className={cn(
                        "flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition",
                        selected
                          ? "border-[#d8cdf0] bg-[#f3eefc] text-[#5d4ba5]"
                          : "border-[#ece0db] bg-white text-[#7c6d69] hover:bg-[#faf6f3]",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden /> {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {kind === "time_override" ? (
              <div className="mt-3">
                <span className="form-label mb-1.5 block font-semibold text-[#7c6d69]">
                  변경할 시간
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <TimeSelect
                    value={startTime}
                    onChange={setStartTime}
                    ariaLabel="1회 변경 시작 시간"
                    className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
                  />
                  <span className="text-sm text-[#8a7b77]">~</span>
                  <TimeSelect
                    value={endTime}
                    onChange={setEndTime}
                    ariaLabel="1회 변경 종료 시간"
                    className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-base outline-none"
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <p role="status" className="mt-3 rounded-xl bg-[#fdf1f0] px-3 py-2 text-sm text-[#a05252]">
                {error}
              </p>
            ) : validationError && date ? (
              <p className="mt-3 text-sm text-[#a89a95]">{validationError}</p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isPending}
                onClick={closeDialog}
              >
                취소
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={isPending || Boolean(validationError)}
                onClick={submit}
              >
                {isPending ? "변경 중…" : "변경 적용"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 원래대로 확인 */}
      {confirmRestore ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="1회 변경 되돌리기 확인"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isPending) {
              event.stopPropagation();
              setConfirmRestore(null);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-5 shadow-[0_22px_60px_rgba(60,48,90,0.3)]">
            <div className="card-title text-[#2a2323]">
              {formatKoreanDate(confirmRestore.date)} 수업을 원래 시간표대로 되돌릴까요?
            </div>
            <p className="mt-2 text-sm leading-5 text-[#655d5d]">
              이 날짜의 1회 변경만 사라지고, 반복 시간표는 그대로예요.
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
                {isPending ? "되돌리는 중…" : "원래대로"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
