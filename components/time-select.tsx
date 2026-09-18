"use client";

// 5분 단위 공용 시간 선택 — 모든 사용자 clock-time 입력(수업 시간/보충 시간/상담 시간)의 단일 정책.
//
// UI는 시(hour)와 분(minute)을 각각 세로로 굴리는 2열 wheel이다. HH:MM 288줄짜리 목록에서
// 원하는 시각을 찾는 것보다 손가락/휠로 빠르게 맞출 수 있어서다. 저장 값은 예전과 똑같은
// "HH:MM" 문자열이라 DB/도메인 로직은 아무것도 바뀌지 않는다.
//
// legacy 보호: DB에 이미 저장된 07:30·17:03·22:30 같은 값은 자동 보정하지 않는다 —
// 현재 값의 시/분을 목록에 그대로 끼워 넣어 화면에서 잃어버리지 않게 하고,
// 사용자가 새로 고르는 순간부터만 허용 범위(수업 08:00~22:00, 5분)가 적용된다.
//
// 새 dependency 없이 scroll-snap + 중앙 index 계산으로 구현한다 (physics 라이브러리 없음).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  MINUTE_OPTIONS,
  firstValidTimeAfter,
  hourOptions,
  isAfter,
  joinTime,
  keepOrNearestMinute,
  minuteOptions,
  splitTime,
  type TimeBound,
} from "@/lib/time-wheel";
import { cn } from "@/lib/utils";

export function isFiveMinuteTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && Number(value.slice(3, 5)) % 5 === 0;
}

// wheel에 한 번에 보이는 줄 수 (가운데가 선택 위치)
const VISIBLE_ROWS = 5;
const CENTER_OFFSET = Math.floor(VISIBLE_ROWS / 2);

function WheelColumn({
  options,
  value,
  onChange,
  label,
  ariaLabel,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  label: string;
  ariaLabel: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemHeightRef = useRef(0);
  const settleRef = useRef<number | null>(null);
  // 프로그램이 굴린 스크롤은 선택으로 치지 않는다 (열 때 중앙 맞추기 등)
  const silentRef = useRef(false);

  const index = Math.max(0, options.indexOf(value));

  // 줄 높이는 실제 렌더 결과에서 잰다 — 글씨 크기 설정(rem)이 커져도 중앙이 어긋나지 않는다.
  const measure = useCallback(() => {
    const list = listRef.current;
    const first = list?.querySelector<HTMLElement>("[data-wheel-item]");
    if (first) {
      itemHeightRef.current = first.getBoundingClientRect().height;
    }
    return itemHeightRef.current;
  }, []);

  const scrollToIndex = useCallback(
    (nextIndex: number, behavior: ScrollBehavior = "auto") => {
      const list = listRef.current;
      const height = measure();
      if (!list || height <= 0) {
        return;
      }
      silentRef.current = true;
      list.scrollTo({ top: nextIndex * height, behavior });
      // smooth 스크롤이 끝난 뒤에 풀어야 중간 스크롤 이벤트가 선택을 덮어쓰지 않는다
      window.setTimeout(() => {
        silentRef.current = false;
      }, behavior === "smooth" ? 260 : 60);
    },
    [measure],
  );

  // 열릴 때 현재 값이 가운데 오도록 (항상 맨 위부터 보여주지 않는다)
  useLayoutEffect(() => {
    scrollToIndex(index);
    // 값이 바깥에서 바뀌면(시 변경으로 분이 조정될 때 등) 다시 맞춘다
  }, [index, scrollToIndex]);

  const commitFromScroll = useCallback(() => {
    const list = listRef.current;
    const height = measure();
    if (!list || height <= 0 || options.length === 0) {
      return;
    }

    const nearest = Math.min(options.length - 1, Math.max(0, Math.round(list.scrollTop / height)));
    const next = options[nearest];
    if (next && next !== value) {
      onChange(next);
    }
  }, [measure, onChange, options, value]);

  const handleScroll = () => {
    if (silentRef.current) {
      return;
    }
    if (settleRef.current !== null) {
      window.clearTimeout(settleRef.current);
    }
    // 스크롤이 멈춘 뒤 한 번만 확정한다 (스크롤 중 값이 계속 튀지 않게)
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      commitFromScroll();
    }, 110);
  };

  useEffect(
    () => () => {
      if (settleRef.current !== null) {
        window.clearTimeout(settleRef.current);
      }
    },
    [],
  );

  const move = (delta: number) => {
    const next = Math.min(options.length - 1, Math.max(0, index + delta));
    if (options[next] && options[next] !== value) {
      onChange(options[next]);
    }
    scrollToIndex(next, "smooth");
  };

  return (
    // 가운데 선택 영역(absolute)보다 위에 그려져야 숫자가 가려지지 않는다
    <div className="relative z-[1] flex min-w-0 flex-1 flex-col items-center">
      <span className="secondary-text mb-1 text-[#8a7b77]">{label}</span>
      <div
        ref={listRef}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          }
        }}
        style={{ height: `calc(var(--wheel-item-h) * ${VISIBLE_ROWS})` }}
        className={cn(
          "w-full min-w-0 overflow-y-auto overscroll-contain text-center",
          "snap-y snap-mandatory scroll-smooth outline-none",
          "focus-visible:ring-2 focus-visible:ring-[#d9c1e8]",
          // 스크롤바는 숨기고 휠/터치 스크롤만 남긴다
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <div style={{ height: `calc(var(--wheel-item-h) * ${CENTER_OFFSET})` }} aria-hidden />
        {options.map((option) => {
          const selected = option === value;
          return (
            <div
              key={option}
              data-wheel-item
              role="option"
              aria-selected={selected}
              onClick={() => {
                if (option !== value) {
                  onChange(option);
                }
                scrollToIndex(options.indexOf(option), "smooth");
              }}
              style={{ height: "var(--wheel-item-h)" }}
              className={cn(
                "flex cursor-pointer snap-center items-center justify-center tabular-nums transition",
                selected ? "text-lg font-semibold text-[#2b2323]" : "text-base text-[#a79996]",
              )}
            >
              {option}
            </div>
          );
        })}
        <div style={{ height: `calc(var(--wheel-item-h) * ${CENTER_OFFSET})` }} aria-hidden />
      </div>
    </div>
  );
}

function TimeWheelDialog({
  initial,
  bound,
  minTime,
  title,
  allowEmpty,
  emptyLabel,
  onCancel,
  onDone,
  onClear,
}: {
  initial: string;
  bound: TimeBound;
  minTime?: string | null;
  title: string;
  allowEmpty: boolean;
  emptyLabel: string;
  onCancel: () => void;
  onDone: (value: string) => void;
  onClear: () => void;
}) {
  // 다이얼로그 안에서만 쓰는 임시 선택 — [완료] 전에는 form 값을 건드리지 않는다
  const fallbackHour = hourOptions({ bound, minTime })[0] ?? "08";
  const parsed = splitTime(initial);
  const [hour, setHour] = useState(parsed?.hour ?? fallbackHour);
  const [minute, setMinute] = useState(parsed?.minute ?? "00");

  const hours = hourOptions({ bound, minTime, current: initial });
  const minutes = minuteOptions({ hour, bound, minTime, current: initial });
  // 시를 바꿔 지금 분을 쓸 수 없게 되면 가장 가까운 분으로 (분이 맨 위로 튀지 않게).
  // 렌더에서 바로 정하므로 값이 한 번 깜빡였다가 바뀌지 않는다.
  const effectiveMinute = minutes.includes(minute) ? minute : keepOrNearestMinute(minutes, minute);

  const changeHour = (nextHour: string) => {
    setHour(nextHour);
    const nextMinutes = minuteOptions({ hour: nextHour, bound, minTime, current: initial });
    setMinute((prev) => keepOrNearestMinute(nextMinutes, prev));
  };

  const value = joinTime(hour, effectiveMinute);
  const canDone = hours.includes(hour) && minutes.includes(effectiveMinute);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2b2323]/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        // 줄 높이는 rem 기반 — 글씨 크기 설정이 커지면 wheel도 같이 커진다
        style={{ ["--wheel-item-h" as string]: "2.75rem" }}
        className="w-full max-w-[19rem] rounded-3xl border border-[#efe4dc] bg-[#fffdfb] p-4 shadow-[0_22px_60px_rgba(60,48,90,0.25)]"
      >
        <div className="card-title text-center text-[#2a2323]">{title}</div>
        <div className="mt-1 text-center text-lg font-semibold tabular-nums text-[#5c4ca8]">
          {value}
        </div>

        <div className="relative mt-3 flex items-stretch gap-2">
          {/* 가운데 선택 영역 — 은은한 배경 + 위아래 경계선 */}
          <div
            aria-hidden
            style={{
              height: "var(--wheel-item-h)",
              top: `calc(var(--wheel-item-h) * ${CENTER_OFFSET} + 1.5rem)`,
            }}
            className="pointer-events-none absolute inset-x-0 rounded-xl border-y border-[#e8ddf3] bg-[#f6f2fc]"
          />
          <WheelColumn
            options={hours}
            value={hour}
            onChange={changeHour}
            label="시"
            ariaLabel="시"
          />
          <WheelColumn
            options={minutes}
            value={effectiveMinute}
            onChange={setMinute}
            label="분"
            ariaLabel="분"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {allowEmpty ? (
            <Button type="button" variant="outline" size="sm" className="mr-auto" onClick={onClear}>
              {emptyLabel}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button type="button" size="sm" disabled={!canDone} onClick={() => onDone(value)}>
            완료
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TimeSelect({
  value,
  onChange,
  ariaLabel,
  className,
  allowEmpty = false,
  emptyLabel = "선택 안 함",
  name,
  bound = "any",
  minTime,
}: {
  // "HH:MM" 또는 DB의 "HH:MM:SS" — 초는 표시/비교에서 잘라낸다 (같은 시각, 변형 아님)
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  className?: string;
  // 보충 시간처럼 비워둘 수 있는 필드
  allowEmpty?: boolean;
  emptyLabel?: string;
  name?: string;
  // 수업/일정 시간의 경계. start=08~21시, end=08~22시(22시는 정각만), any=제한 없음
  bound?: TimeBound;
  // 종료 시간 필드에서 시작 시각을 주면 그보다 뒤만 고를 수 있다
  minTime?: string | null;
}) {
  const current = (value ?? "").slice(0, 5);
  const [open, setOpen] = useState(false);

  // 시작 시간을 바꿔 종료가 무효가 되면 가장 이른 유효 시각으로만 옮긴다
  // (무효 상태를 조용히 두지 않는다 — 저장 단계 검증은 그대로 유지된다)
  useEffect(() => {
    if (bound !== "end" || !minTime || current === "") {
      return;
    }
    if (isAfter(current, minTime)) {
      return;
    }
    const fixed = firstValidTimeAfter(minTime, bound);
    if (fixed && fixed !== current) {
      onChange(fixed);
    }
  }, [bound, current, minTime, onChange]);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn("text-left tabular-nums", className)}
      >
        {/* 비워둘 수 있는 필드는 "시간 없음" 같은 안내 문구, 필수 필드는 예전 select와 같은 "시간 선택" */}
        {current || (allowEmpty ? emptyLabel : "시간 선택")}
      </button>

      {/* 기존 form dirty 감지/전송을 위해 값 자체는 그대로 노출한다 */}
      {name ? <input type="hidden" name={name} value={current} readOnly /> : null}

      {open ? (
        <TimeWheelDialog
          initial={current}
          bound={bound}
          minTime={minTime}
          title={ariaLabel}
          allowEmpty={allowEmpty}
          emptyLabel={emptyLabel}
          onCancel={() => setOpen(false)}
          onDone={(next) => {
            setOpen(false);
            if (next !== current) {
              onChange(next);
            }
          }}
          onClear={() => {
            setOpen(false);
            if (current !== "") {
              onChange("");
            }
          }}
        />
      ) : null}
    </>
  );
}

export { MINUTE_OPTIONS };
