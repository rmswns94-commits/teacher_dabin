import { getHolidayPreset } from "@hyunbinseo/holidays-kr";

// 대한민국 공휴일 — 앱 전체의 단일 출처.
//
// 날짜 자체는 사용자 데이터가 아니라 달력 사실(fact)이므로 DB에 저장하지 않는다.
// 우주항공청 월력요항을 그대로 담은 패키지(@hyunbinseo/holidays-kr)에서 연 단위로 읽는다.
// 음력 공휴일(설날·추석·부처님 오신 날), 대체공휴일, 선거일, 이미 지정된 임시공휴일이
// 모두 포함되어 있어 직접 계산하지 않는다.
//
// 조회는 연 단위 batch다 — 달력 42칸이나 그룹마다 묻지 않는다(N+1 금지).
// 데이터가 없는 연도(패키지 수록 범위 밖)는 RangeError라 "공휴일 없음"으로 조용히 넘긴다.
// 그 경우 앱은 공휴일을 모르는 상태로 기존과 동일하게 동작한다.

const cache = new Map<string, ReadonlyMap<string, string[]>>();

async function loadYear(year: string): Promise<ReadonlyMap<string, string[]>> {
  const cached = cache.get(year);
  if (cached) {
    return cached;
  }

  let map: ReadonlyMap<string, string[]> = new Map();

  try {
    const preset = await getHolidayPreset(year);
    map = new Map(Object.entries(preset).map(([date, names]) => [date, [...names]]));
  } catch {
    // 수록되지 않은 연도 — 공휴일 없음으로 둔다 (화면은 그대로 뜬다)
    map = new Map();
  }

  cache.set(year, map);
  return map;
}

// 날짜 범위(KST date-only)의 공휴일 — `YYYY-MM-DD` → 공휴일 이름들
export async function getKoreanHolidaysInRange(startDate: string, endDate: string) {
  const result = new Map<string, string[]>();

  if (!startDate || !endDate || startDate > endDate) {
    return result;
  }

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return result;
  }

  for (let year = startYear; year <= endYear; year += 1) {
    const yearly = await loadYear(String(year));
    for (const [date, names] of yearly) {
      if (date >= startDate && date <= endDate) {
        result.set(date, names);
      }
    }
  }

  return result;
}
