// 누적 회고 아카이브의 순수 aggregation 헬퍼.
// 원칙: Teacher가 실제 적은 문구만 사용한다 (AI/창작/변형 없음 — 한줄요약 기능 아님).
// dedupe는 display aggregation일 뿐, 원본 Daily Log는 절대 수정하지 않는다.

export type ReflectionTextRow = {
  class_date: string;
  reflection_good: string | null;
  reflection_hard: string | null;
  reflection_next: string | null;
};

export type ReflectionCategoryKey = "good" | "hard" | "next";

export function pickCategory(row: ReflectionTextRow, key: ReflectionCategoryKey) {
  return key === "good"
    ? row.reflection_good
    : key === "hard"
      ? row.reflection_hard
      : row.reflection_next;
}

// 월간 누적 bullet: trim → empty 제거 → 완전 동일 문구 제거, 날짜순 유지.
// (rows는 이미 class_date asc 정렬로 전달된다)
export function collectMonthlyBullets(rows: ReflectionTextRow[], key: ReflectionCategoryKey) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const value = pickCategory(row, key)?.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }

  return out;
}

export type FrequentBullet = { text: string; count: number };

// 전체 누적 bullet: 완전 동일 문구의 빈도를 세어 "꾸준히/반복해서" 나타난 내용부터.
// 빈도 desc → 최근 작성일 desc, 상위 cap개만 반환한다 (수백 개 원문을 DOM에 전부 내리지 않기 위함
// — 원문 전체는 월 상세의 날짜별 history에서 본다).
export function collectFrequentBullets(
  rows: ReflectionTextRow[],
  key: ReflectionCategoryKey,
  cap = 8,
): FrequentBullet[] {
  const byText = new Map<string, { count: number; lastDate: string }>();

  for (const row of rows) {
    const value = pickCategory(row, key)?.trim();
    if (!value) {
      continue;
    }
    const entry = byText.get(value);
    if (entry) {
      entry.count += 1;
      if (row.class_date > entry.lastDate) {
        entry.lastDate = row.class_date;
      }
    } else {
      byText.set(value, { count: 1, lastDate: row.class_date });
    }
  }

  return [...byText.entries()]
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        b[1].lastDate.localeCompare(a[1].lastDate) ||
        a[0].localeCompare(b[0], "ko"),
    )
    .slice(0, cap)
    .map(([text, meta]) => ({ text, count: meta.count }));
}

export type MonthAggregate = { month: string; dateCount: number; logCount: number };

// 월별 aggregate: 쿼리 1번으로 받은 rows를 JS에서 접는다 (월마다 별도 쿼리 금지). 최신 월 desc.
export function aggregateByMonth(rows: { class_date: string }[]): MonthAggregate[] {
  const byMonth = new Map<string, { dates: Set<string>; logs: number }>();

  for (const row of rows) {
    const month = row.class_date.slice(0, 7);
    const entry = byMonth.get(month) ?? { dates: new Set<string>(), logs: 0 };
    entry.dates.add(row.class_date);
    entry.logs += 1;
    byMonth.set(month, entry);
  }

  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, entry]) => ({ month, dateCount: entry.dates.size, logCount: entry.logs }));
}
