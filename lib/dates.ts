import { APP_TIMEZONE } from "@/lib/schedule";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// "오늘"은 항상 Asia/Seoul 기준으로 계산한다. 배포 서버가 UTC여도
// 자정~오전 9시 사이에 날짜가 하루 밀리지 않는다.
export function toDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA gives YYYY-MM-DD
}

export function todayDateString() {
  return toDateString(new Date());
}

export function formatKoreanDateFull(ymd: string | null | undefined) {
  if (!ymd) {
    return "";
  }

  const [y, m, d] = ymd.split("-").map(Number);

  if (!y || !m || !d) {
    return ymd;
  }

  return `${y}년 ${m}월 ${d}일`;
}

// "4/17" 같은 아주 짧은 생일 표기용
export function formatShortMonthDay(ymd: string | null | undefined) {
  if (!ymd) {
    return "";
  }

  const [, m, d] = ymd.split("-").map(Number);
  return m && d ? `${m}/${d}` : "";
}

export function formatKoreanDate(ymd: string | null | undefined, withWeekday = false) {
  if (!ymd) {
    return "날짜 미정";
  }

  const [y, m, d] = ymd.split("-").map(Number);

  if (!y || !m || !d) {
    return ymd;
  }

  if (withWeekday) {
    // 요일은 달력 날짜에서만 결정되므로 UTC 정오 기준으로 계산해도 안전하다.
    const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
    return `${y}년 ${m}월 ${d}일 (${weekday})`;
  }

  return `${m}월 ${d}일`;
}
