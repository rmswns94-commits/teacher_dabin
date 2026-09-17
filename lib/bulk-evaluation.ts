// 학생 평가 일괄 입력의 순수 helper — "미평가" 학생에게만 값을 적용한다.
// - 미평가 판정은 정확히 `=== ""` (이 세 필드는 빈 문자열이 미평가라는 기존 폼 규약).
//   falsy 판정(!value) 금지 원칙: false/0 같은 값을 가진 필드는 애초에 여기서 다루지 않는다
//   (온라인 복습 boolean|null 은 학생별 확인이 필요한 3-state라 bulk 대상에서 제외).
// - 결석 학생 제외: 결석 카드에는 평가 컨트롤 자체가 렌더되지 않는 기존 정책과 동일
//   (기존 "숙제 전원 완료로 표시"도 결석 제외).
// - 출결(attendance)은 폼 기본값이 "출석"이라 미평가 상태가 존재하지 않는다 — bulk 없음.

export type BulkEvaluationField = "homeworkStatus" | "focusLevel" | "participationLevel";

export type BulkEvaluationEntry = {
  attendance: string;
  homeworkStatus: string;
  focusLevel: string;
  participationLevel: string;
};

// 적용 대상 학생 id — 버튼에 보여주는 count와 실제 적용이 같은 판정을 쓰는 단일 소스.
export function bulkUnevaluatedTargets<T extends BulkEvaluationEntry>(
  studentIds: readonly string[],
  entries: Readonly<Record<string, T>>,
  field: BulkEvaluationField,
): string[] {
  return studentIds.filter((id) => {
    const entry = entries[id];
    return entry !== undefined && entry.attendance !== "absent" && entry[field] === "";
  });
}

// targets에만 value를 적용한 새 entries를 돌려준다.
// - 이미 값이 있는 학생은 적용 직전 재검사로 절대 덮어쓰지 않는다.
// - 변경된 학생의 entry만 새 object — 나머지는 reference 유지 (불필요한 카드 re-render 방지).
// - 아무도 안 바뀌면 입력 entries를 그대로 반환 → setState bail-out (dirty/autosave 무변화).
export function applyBulkEvaluation<T extends BulkEvaluationEntry>(
  entries: Readonly<Record<string, T>>,
  targets: readonly string[],
  field: BulkEvaluationField,
  value: string,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = { ...entries };
  for (const id of targets) {
    const entry = entries[id];
    if (entry === undefined || entry.attendance === "absent" || entry[field] !== "") {
      continue;
    }
    const patched = { ...entry };
    patched[field] = value as T[BulkEvaluationField];
    next[id] = patched;
    changed = true;
  }
  return changed ? next : (entries as Record<string, T>);
}
