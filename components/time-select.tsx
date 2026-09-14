"use client";

// 5분 단위 공용 시간 선택 — 모든 사용자 clock-time 입력(수업 시간/보충 시간)의 단일 정책.
// native <input type="time">은 step=300을 줘도 Chrome 데스크톱·iOS에서 여전히 1분 단위
// 타이핑/스피너 입력이 가능해 "5분 단위로만 선택" 요구를 UI에서 보장하지 못한다 →
// 기존 폼 select 스타일 그대로의 select로 교체한다 (새 dependency 없음).
//
// legacy 보호: DB에 이미 저장된 17:03 같은 홀수 분 값은 자동 반올림하지 않는다 —
// 현재 값을 "17:03 (기존 시간)" option으로 목록 맨 위에 유지해, 손대지 않고 저장하면
// 값이 몰래 바뀌지 않고, 사용자가 새로 고르는 순간부터는 5분 단위만 선택 가능하다.
// (시스템 timestamp(created_at 등)는 이 컴포넌트와 무관 — 사용자 입력 전용.)

// 00:00 ~ 23:55, 288개 — module-level 상수라 render마다 재계산하지 않는다
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 5) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

export function isFiveMinuteTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && Number(value.slice(3, 5)) % 5 === 0;
}

export function TimeSelect({
  value,
  onChange,
  ariaLabel,
  className,
  allowEmpty = false,
  emptyLabel = "선택 안 함",
  name,
}: {
  // "HH:MM" 또는 DB의 "HH:MM:SS" — 초는 표시/비교에서 잘라낸다 (같은 시각, 변형 아님)
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  className?: string;
  // 보충 시간처럼 비워둘 수 있는 필드 — 빈 option을 항상 유지
  allowEmpty?: boolean;
  emptyLabel?: string;
  name?: string;
}) {
  const current = (value ?? "").slice(0, 5);
  const isLegacyOdd = current !== "" && !TIME_OPTIONS.includes(current);

  return (
    <select
      value={current}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      name={name}
      className={className}
    >
      {allowEmpty || current === "" ? (
        <option value="">{allowEmpty ? emptyLabel : "시간 선택"}</option>
      ) : null}
      {isLegacyOdd ? <option value={current}>{current} (기존 시간)</option> : null}
      {TIME_OPTIONS.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}
