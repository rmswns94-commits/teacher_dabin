// 학생 평가 일괄 입력의 순수 helper — "미평가" 학생에게만 값을 적용한다.
// - 미평가 판정(필드별 실제 semantics, falsy 판정(!value) 금지):
//   · string 세그먼트 필드(숙제/집중/참여/질문/배려/노력)는 정확히 `=== ""`.
//   · 온라인 복습(boolean|null)은 정확히 `=== null` — false(미완료)는 실제 평가값이라
//     절대 미평가로 취급하지 않는다.
// - 결석 학생 제외: 결석 카드에는 평가 컨트롤 자체가 렌더되지 않는 기존 정책과 동일.
// - 출결(attendance)은 폼 기본값이 "출석"이라 미평가 상태가 존재하지 않는다 — bulk 없음.

export type BulkEvaluationField =
  | "homeworkStatus"
  | "focusLevel"
  | "participationLevel"
  | "questionLevel"
  | "kindnessLevel"
  | "effortLevel"
  | "onlineReviewCompleted";

export type BulkEvaluationEntry = {
  attendance: string;
  homeworkStatus: string;
  focusLevel: string;
  participationLevel: string;
  questionLevel: string;
  kindnessLevel: string;
  effortLevel: string;
  onlineReviewCompleted: boolean | null;
};

function isUnevaluated(entry: BulkEvaluationEntry, field: BulkEvaluationField): boolean {
  return field === "onlineReviewCompleted"
    ? entry.onlineReviewCompleted === null
    : entry[field] === "";
}

// 적용 대상 학생 id — 버튼에 보여주는 count와 실제 적용이 같은 판정을 쓰는 단일 소스.
export function bulkUnevaluatedTargets<T extends BulkEvaluationEntry>(
  studentIds: readonly string[],
  entries: Readonly<Record<string, T>>,
  field: BulkEvaluationField,
): string[] {
  return studentIds.filter((id) => {
    const entry = entries[id];
    return entry !== undefined && entry.attendance !== "absent" && isUnevaluated(entry, field);
  });
}

// targets에만 value를 적용한 새 entries를 돌려준다.
// - 이미 값이 있는 학생은 적용 직전 재검사로 절대 덮어쓰지 않는다 (false 포함).
// - 변경된 학생의 entry만 새 object — 나머지는 reference 유지 (불필요한 카드 re-render 방지).
// - 아무도 안 바뀌면 입력 entries를 그대로 반환 → setState bail-out (dirty/autosave 무변화).
export function applyBulkEvaluation<T extends BulkEvaluationEntry>(
  entries: Readonly<Record<string, T>>,
  targets: readonly string[],
  field: BulkEvaluationField,
  value: string | boolean,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = { ...entries };
  for (const id of targets) {
    const entry = entries[id];
    if (entry === undefined || entry.attendance === "absent" || !isUnevaluated(entry, field)) {
      continue;
    }
    const patched = { ...entry };
    if (field === "onlineReviewCompleted") {
      // constraint상 이 필드는 boolean | null — true(완료)만 bulk 값으로 쓴다
      patched.onlineReviewCompleted = (value === true) as T["onlineReviewCompleted"];
    } else {
      // constraint상 나머지 필드는 string
      patched[field] = String(value) as T[Exclude<BulkEvaluationField, "onlineReviewCompleted">];
    }
    next[id] = patched;
    changed = true;
  }
  return changed ? next : (entries as Record<string, T>);
}
