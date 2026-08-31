"use client";

import { DAY_DISPLAY_ORDER, DAY_LABELS } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export type PickerValue = {
  days: number[];
  startTime: string;
  endTime: string;
};

// 블록 입력 공용 검증. 통과하면 null, 아니면 한국어 에러 메시지.
export function validatePickerValue(value: PickerValue) {
  if (value.days.length === 0) {
    return "수업 요일을 하나 이상 선택해주세요.";
  }

  if (!value.startTime || !value.endTime) {
    return "시작 시간과 종료 시간을 입력해주세요.";
  }

  if (value.endTime <= value.startTime) {
    return "종료 시간은 시작 시간보다 늦어야 해요.";
  }

  return null;
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [6, 0];

export function WeekdayTimePicker({
  value,
  onChange,
}: {
  value: PickerValue;
  onChange: (next: PickerValue) => void;
}) {
  const toggleDay = (day: number) => {
    onChange({
      ...value,
      days: value.days.includes(day)
        ? value.days.filter((d) => d !== day)
        : [...value.days, day],
    });
  };

  const setDays = (days: number[]) => onChange({ ...value, days });

  return (
    <div className="space-y-2.5">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-[#8a7b77]">수업 요일</span>
        <div className="flex flex-wrap gap-1.5">
          {DAY_DISPLAY_ORDER.map((day) => {
            const selected = value.days.includes(day);

            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={selected}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-medium transition",
                  selected
                    ? "border-[#d8cdf0] bg-[#eeeafb] font-semibold text-[#5d4ba5] shadow-sm"
                    : "border-[#ece0db] bg-white text-[#8a7b77] hover:bg-[#faf6f3]",
                )}
              >
                {DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => setDays(WEEKDAYS)}
            className="rounded-full border border-[#e5d9d3] bg-white px-2.5 py-1 text-[#756a67] transition hover:bg-[#faf6f3]"
          >
            평일
          </button>
          <button
            type="button"
            onClick={() => setDays(WEEKEND)}
            className="rounded-full border border-[#e5d9d3] bg-white px-2.5 py-1 text-[#756a67] transition hover:bg-[#faf6f3]"
          >
            주말
          </button>
          <button
            type="button"
            onClick={() => setDays([...DAY_DISPLAY_ORDER])}
            className="rounded-full border border-[#e5d9d3] bg-white px-2.5 py-1 text-[#756a67] transition hover:bg-[#faf6f3]"
          >
            전체
          </button>
          {value.days.length > 0 ? (
            <button
              type="button"
              onClick={() => setDays([])}
              className="rounded-full px-2.5 py-1 text-[#a79996] transition hover:bg-[#faf6f3]"
            >
              선택 해제
            </button>
          ) : null}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-[#8a7b77]">수업 시간</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            name="pickerStart"
            value={value.startTime}
            onChange={(event) => onChange({ ...value, startTime: event.target.value })}
            aria-label="시작 시간"
            className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
          />
          <span className="text-sm text-[#8a7b77]">~</span>
          <input
            type="time"
            name="pickerEnd"
            value={value.endTime}
            onChange={(event) => onChange({ ...value, endTime: event.target.value })}
            aria-label="종료 시간"
            className="rounded-xl border border-[#ece0db] bg-white px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>

      {/* dirty 감지용: 요일 토글 상태를 form 값으로 노출 (서버에서는 무시됨) */}
      <input type="hidden" name="pickerDays" value={sortDaysForValue(value.days)} readOnly />
    </div>
  );
}

function sortDaysForValue(days: number[]) {
  return [...days].sort((a, b) => a - b).join(",");
}
