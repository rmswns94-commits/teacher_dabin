import { getKoreanHolidaysInRange } from "@/lib/korean-holidays";
import { getAcademyClosuresInRange } from "@/lib/supabase/queries/academy-closures";

// "오늘 할 일" / "시험 대비" 캘린더에서 일요일처럼 날짜 숫자만 빨갛게 보여줄 날짜.
//
// 두 캘린더는 수업 일지 캘린더와 달리 휴강/공휴일을 설명하지 않는다 —
// 색 하나로만 "쉬는 날 느낌"을 준다(이모지·배경·라벨 없음).
// 그래서 공휴일과 학원 휴강일을 구분하지 않고 하나의 날짜 목록으로 합친다:
// 같은 날이 둘 다여도 red는 한 번뿐이다.
//
// 출처는 둘 다 기존 canonical source 그대로다.
// - 공휴일: lib/korean-holidays (연 단위 batch)
// - 학원 휴강일: getAcademyClosuresInRange (현재 학원 = 현재 workspace만, RLS)
// 조회는 날짜 범위 batch 두 번이다 — 날짜 칸마다 묻지 않는다(N+1 금지).
export async function getRedDatesInRange(startDate: string, endDate: string) {
  const [holidays, closures] = await Promise.all([
    getKoreanHolidaysInRange(startDate, endDate),
    getAcademyClosuresInRange(startDate, endDate),
  ]);

  return [...new Set([...holidays.keys(), ...closures])];
}
