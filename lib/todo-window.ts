// Dashboard To Do의 수업 시간 노출 window 계산 (순수 함수 — 시간 소스와 분리해 테스트 가능).
//
// 정책: 수업 그룹에 연결된 To Do는 [수업 시작 - 20분, 수업 종료) 동안만 현재 To Do에 표시.
// 수업 종료 후에는 화면에서만 사라진다 (DB row 삭제/완료 변경 없음 — Group Detail에서 계속 관리).
// due 날짜에 그 그룹의 수업이 없으면 all-day fallback으로 하루 종일 표시한다
// (Teacher가 수업 없는 날짜를 직접 고를 수 있으므로, 숨겨서 영영 못 보게 하지 않는다).

export const TODO_CLASS_LEAD_MINUTES = 20;

export type TodoClassWindow = { start: string; end: string }; // "HH:MM"(:SS 허용)

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

// half-open interval: [start - LEAD, end) — 시작 정확히 20분 전부터, 종료 시각부터는 제외
export function isTodoWindowOpen(window: TodoClassWindow | null, nowMinutes: number) {
  if (!window) {
    return false;
  }
  return (
    nowMinutes >= timeToMinutes(window.start) - TODO_CLASS_LEAD_MINUTES &&
    nowMinutes < timeToMinutes(window.end)
  );
}

// 날짜 있는 To Do(다음 수업 계획 연동/수동 dated 항목): due 당일 + window 안에서만.
// 그날 수업이 없으면(all-day fallback) 하루 종일. due가 지나면(수업 종료 정책과 일관되게) 숨김.
export function isDatedTodoVisible(
  dueDate: string | null | undefined,
  window: TodoClassWindow | null,
  today: string,
  nowMinutes: number,
) {
  if (!dueDate || dueDate !== today) {
    return false;
  }
  return window ? isTodoWindowOpen(window, nowMinutes) : true;
}

// KST(고정 +09:00) 기준 현재 날짜/분 — epoch ms에서 계산 (서버/클라이언트 동일 규칙)
export function kstNowParts(epochMs: number) {
  const kst = new Date(epochMs + 9 * 3_600_000);
  return {
    today: kst.toISOString().slice(0, 10),
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
  };
}

// 서버 렌더에서 초기 시각을 얻기 위한 helper (component 본문의 직접 Date.now 호출 회피)
export function currentEpochMs() {
  return Date.now();
}
