// Dashboard 수업 브리핑 카드의 상태 resolver (Smart Briefing PHASE 1) — 순수 함수.
//
// 카드는 conceptual하게 3가지 mode를 가진다:
//   briefing            수업 전 / 수업 중 (기존 브리핑 UI)
//   wrap_up_incomplete  수업 종료 + Finalized Daily Log 없음 (체크리스트 + 액션)
//   wrap_up_complete    수업 종료 + Finalized Daily Log 있음
//
// - 입력은 전부 이미 계산된 값이다: 오늘 effective occurrence 목록(getScheduleOverview.todayOccurrences —
//   휴강/학원 휴강/공휴일 휴강/이동 source 제외, 이동 destination/보강/시간 변경은 실제 시각),
//   현재 시각(epoch), canonical identity(user+group+lesson_date)의 Finalized 여부.
// - "현재 mode"를 DB에 저장하지 않는다 — 같은 시각/데이터면 서버 렌더·F5·PWA 복귀 어디서나 같은 결과.
// - 시간 비교는 epoch 숫자만 쓴다 ("HH:MM" 문자열 비교 없음). 종료 판정은 now >= endEpoch(half-open).

export type ClassCardMode = "briefing" | "wrap_up_incomplete" | "wrap_up_complete";

export type CardOccurrenceTiming = {
  key: string; // occurrenceKey() — 선택 state의 stable id
  groupId: string;
  startEpoch: number;
  endEpoch: number;
};

// [start, end) 안이면 진행 중 — getScheduleOverview의 current 판정과 같은 half-open 규칙
export function isOccurrenceActive(occ: Pick<CardOccurrenceTiming, "startEpoch" | "endEpoch">, nowEpoch: number) {
  return occ.startEpoch <= nowEpoch && nowEpoch < occ.endEpoch;
}

// 자동 focus 대상 (start ASC 정렬된 오늘 occurrence 기준):
//   1) 진행 중인 수업 (연속 수업이면 이전 수업 wrap-up보다 우선 — actual current > previous wrap-up)
//   2) 없으면 오늘 가장 최근에 끝난 수업 (다음 수업 시작 전까지 그 수업의 마무리)
//   3) 없으면 오늘 다음에 시작할 수업 (첫 수업 전 — 기존 Next Class 브리핑과 같은 대상)
//   4) 오늘 수업이 없으면 null
export function autoFocusOccurrence<T extends CardOccurrenceTiming>(
  occurrences: readonly T[],
  nowEpoch: number,
): T | null {
  const current = occurrences.find((occ) => isOccurrenceActive(occ, nowEpoch));
  if (current) {
    return current;
  }

  let lastEnded: T | null = null;
  for (const occ of occurrences) {
    if (occ.endEpoch <= nowEpoch && (!lastEnded || occ.endEpoch >= lastEnded.endEpoch)) {
      lastEnded = occ;
    }
  }
  if (lastEnded) {
    return lastEnded;
  }

  return occurrences.find((occ) => occ.startEpoch > nowEpoch) ?? null;
}

// 선택된 occurrence의 mode — 끝나지 않았으면(미래/진행 중) 브리핑, 끝났으면 Finalized 여부로 wrap-up
export function resolveClassCardMode(
  occ: Pick<CardOccurrenceTiming, "endEpoch">,
  nowEpoch: number,
  finalized: boolean,
): ClassCardMode {
  if (nowEpoch < occ.endEpoch) {
    return "briefing";
  }
  return finalized ? "wrap_up_complete" : "wrap_up_incomplete";
}

// 수동 탐색(이전/다음)은 "선택 당시의 자동 focus"와 함께 기억한다. 새 실제 수업이 시작되어
// 자동 focus가 바뀌면 이전 선택은 무효가 되어 카드가 새 현재 수업으로 자동 전환된다 (PART H).
// 같은 자동 focus 안에서는(수업 종료로 mode만 바뀌는 경우 포함) 사용자의 선택을 유지한다.
export type CardSelection = { key: string; autoKey: string | null };

export function resolveViewedKey(selection: CardSelection | null, autoKey: string | null) {
  if (selection && selection.autoKey === autoKey) {
    return selection.key;
  }
  return autoKey;
}

// 이전/다음 대상 — 목록 순서(start ASC) 기준. 첫/마지막이면 null (버튼 disabled).
export function adjacentOccurrenceKeys(keys: readonly string[], viewedKey: string | null) {
  const index = viewedKey ? keys.indexOf(viewedKey) : -1;
  if (index < 0) {
    return { previous: null, next: null, index: -1 };
  }
  return {
    previous: index > 0 ? keys[index - 1] : null,
    next: index < keys.length - 1 ? keys[index + 1] : null,
    index,
  };
}
