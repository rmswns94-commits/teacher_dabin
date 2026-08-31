// 월간 캘린더 계산 유틸. 모든 날짜는 "YYYY-MM-DD" 문자열로만 다루고,
// Date 객체가 필요할 때는 UTC 정오에 고정해 타임존으로 날짜가 밀리지 않게 한다.

export function parseMonthParam(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return fallback;
  }

  const month = Number(value.slice(5));
  return month >= 1 && month <= 12 ? value : fallback;
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${y}년 ${m}월`;
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function dayOfWeekOf(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

// 일요일 시작 주 단위 grid. 빈 칸은 null.
export function buildMonthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const firstDow = dayOfWeekOf(`${month}-01`);
  const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}
