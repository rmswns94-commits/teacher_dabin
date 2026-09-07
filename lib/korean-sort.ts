// 학생 이름 가나다순 정렬의 단일 소스.
// DB order()는 Postgres collation에 따라 한국어 가나다 정렬을 보장하지 않으므로
// application layer에서 Intl.Collator("ko-KR")로 정렬한다.
const koreanNameCollator = new Intl.Collator("ko-KR", {
  sensitivity: "base",
  numeric: true,
});

// legacy 데이터의 앞뒤 공백은 비교에서만 무시한다 (DB 값은 수정하지 않음)
export function compareKoreanName(a: string, b: string) {
  return koreanNameCollator.compare(a.trim(), b.trim());
}

// 이름 가나다순 + 동명이인은 id로 2차 정렬(안정적 — 렌더마다 순서가 흔들리지 않게).
// 원본 배열은 변경하지 않고 복사본을 돌려준다.
export function sortByKoreanName<T>(
  items: T[],
  nameOf: (item: T) => string,
  idOf: (item: T) => string,
): T[] {
  return [...items].sort(
    (a, b) => compareKoreanName(nameOf(a), nameOf(b)) || idOf(a).localeCompare(idOf(b)),
  );
}
