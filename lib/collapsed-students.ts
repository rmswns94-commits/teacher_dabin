// 학생 평가 카드 접힘 상태 — 100% 사용자 조작 UI-only preference.
// 사이드바 접기(components/sidebar.tsx)와 동일한 localStorage + useSyncExternalStore 패턴:
// 서버 스냅샷은 항상 ""(전부 펼침)라 hydration mismatch가 없고, hydration 직후
// 저장값으로 전환된다. 평가 완료 여부와 무관하고 draft/final payload에 절대 넣지 않는다.
//
// key 단위: group_id + 수업 날짜 — group_id(uuid)가 teacher에 종속이라 사실상
// teacher+group+date scope다. mode(create/draft/finalized edit)는 key에 포함하지
// 않아 같은 수업은 어느 화면에서든 같은 접힘 상태를 쓴다.
// 값: 접힌 student_id 배열의 JSON. 손상/비배열/비문자 항목은 조용히 무시한다.

const KEY_PREFIX = "dabin-daily-log-collapsed";

export function collapsedStudentsKey(groupId: string, classDate: string) {
  return `${KEY_PREFIX}:${groupId}:${classDate}`;
}

export function parseCollapsedIds(raw: string): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

// 접기/펴기 토글 결과 (순수) — 있으면 제거(펴기), 없으면 추가(접기)
export function toggleCollapsedId(ids: readonly string[], studentId: string): string[] {
  return ids.includes(studentId)
    ? ids.filter((id) => id !== studentId)
    : [...ids, studentId];
}

let listeners: (() => void)[] = [];
// key당 1회 read cache — 렌더/카드마다 storage를 다시 읽지 않는다 (write가 갱신).
// localStorage가 막힌 환경(private mode 등)에서도 이 캐시로 세션 내 접기/펴기는 동작한다.
const rawCache = new Map<string, string>();

export function subscribeCollapsedStudents(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getCollapsedStudentsSnapshot(key: string): string {
  const cached = rawCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let raw = "";
  try {
    raw = localStorage.getItem(key) ?? "";
  } catch {
    // storage 접근 불가 — 빈 값으로 시작, 세션 메모리(cache)로만 동작
  }
  rawCache.set(key, raw);
  return raw;
}

export function getCollapsedStudentsServerSnapshot() {
  return "";
}

export function writeCollapsedStudents(key: string, ids: readonly string[]) {
  const raw = ids.length > 0 ? JSON.stringify(ids) : "";
  rawCache.set(key, raw);
  try {
    if (raw) {
      localStorage.setItem(key, raw);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // 저장 실패 시 reload persistence만 포기 — 세션 내 동작(cache)은 유지
  }
  for (const listener of listeners) {
    listener();
  }
}
