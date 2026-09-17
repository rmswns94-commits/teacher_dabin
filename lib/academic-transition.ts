// 학기·학년 전환 마법사의 순수 계산 helper.
//
// 원칙:
// - 이 파일은 "현재 학생 상태(학년) + 현재 소속(membership)"의 변경안만 계산한다.
//   과거 일지/출결/평가/숙제/보충/성장/시험 기록은 계산에도, 적용에도 등장하지 않는다.
// - 학년 제안은 lib/grades의 gradeValues 순서(=DB enum grade_level 순서)만 사용한다.
//   문자열 파싱("중2"에서 2 추출) 금지 — 마지막 학년(고1)은 다음이 없어 제안하지 않는다.
// - 반 이동은 PHASE 1과 같은 semantics: "선택한 기존 소속 하나만 종료 + 새 소속 추가".
//   학생의 다른 동시 소속(특강 등)은 계산에서 아예 건드리지 않는다.
// - 변경이 없는 학생(no-op)은 계획에서 제외한다 — 불필요한 update를 만들지 않는다.

import { gradeValues } from "@/lib/grades";
import type { StudentGrade } from "@/lib/supabase/types";

// "반 변경 없음"과 "미배정(현재 반에서 나가기)"을 구분하는 select 전용 sentinel
export const KEEP_GROUP = "";
export const UNASSIGNED_GROUP = "__unassigned__";

export type TransitionSelection = {
  // 새 학년 (변경하지 않으면 현재 학년 값 그대로)
  grade: StudentGrade;
  // 이동할 기존 소속 ("" = 없음/선택 안 함)
  fromGroupId: string;
  // 이동할 새 소속 ("" = 반 변경 없음, UNASSIGNED_GROUP = 미배정, 그 외 = 그룹 id)
  toGroupId: string;
};

export type TransitionStudentState = {
  studentId: string;
  currentGrade: StudentGrade;
  // 현재 소속 그룹 id (표시 순서 그대로 — canonical)
  currentGroupIds: string[];
};

// 서버로 보내는 최소 변경안 (RPC payload와 1:1)
export type TransitionChange = {
  studentId: string;
  // null = 학년 변경 없음
  grade: StudentGrade | null;
  // null = 종료할 기존 소속 없음
  fromGroupId: string | null;
  // null = 새로 추가할 소속 없음
  toGroupId: string | null;
};

// 다음 학년 제안 — enum 순서의 바로 다음 값. 마지막 학년은 null(직접 선택 필요).
// 초6 → 중1, 중3 → 고1처럼 학교급이 바뀌는 경계도 enum 순서가 그대로 담당한다.
export function nextGradeSuggestion(grade: string): StudentGrade | null {
  const index = (gradeValues as readonly string[]).indexOf(grade);

  if (index < 0 || index >= gradeValues.length - 1) {
    // 알 수 없는 학년(스키마 밖 값)이나 마지막 학년은 자동 제안하지 않는다
    return null;
  }

  return gradeValues[index + 1];
}

// 학생 한 명의 선택을 실제 변경안으로 — 바뀌는 게 없으면 null.
export function buildTransitionChange(
  state: TransitionStudentState,
  selection: TransitionSelection,
): TransitionChange | null {
  const grade = selection.grade !== state.currentGrade ? selection.grade : null;

  let fromGroupId: string | null = null;
  let toGroupId: string | null = null;

  if (selection.toGroupId === UNASSIGNED_GROUP) {
    // 미배정 = 선택한 기존 소속만 종료 (다른 소속은 유지)
    fromGroupId = selection.fromGroupId && state.currentGroupIds.includes(selection.fromGroupId)
      ? selection.fromGroupId
      : null;
  } else if (selection.toGroupId !== KEEP_GROUP) {
    const alreadyMember = state.currentGroupIds.includes(selection.toGroupId);
    const validFrom =
      selection.fromGroupId && state.currentGroupIds.includes(selection.fromGroupId)
        ? selection.fromGroupId
        : null;

    if (validFrom !== selection.toGroupId) {
      // 같은 반으로의 이동은 no-op
      fromGroupId = validFrom;
      toGroupId = alreadyMember ? null : selection.toGroupId;
    }
  }

  if (grade === null && fromGroupId === null && toGroupId === null) {
    return null;
  }

  return { studentId: state.studentId, grade, fromGroupId, toGroupId };
}

// 선택된 학생들의 변경안 목록 (순서는 states의 canonical 순서 유지)
export function planTransition(
  states: readonly TransitionStudentState[],
  selections: Readonly<Record<string, TransitionSelection>>,
  selectedIds: readonly string[],
): TransitionChange[] {
  const selected = new Set(selectedIds);
  const changes: TransitionChange[] = [];

  for (const state of states) {
    if (!selected.has(state.studentId)) {
      continue;
    }

    const selection = selections[state.studentId];
    if (!selection) {
      continue;
    }

    const change = buildTransitionChange(state, selection);
    if (change) {
      changes.push(change);
    }
  }

  return changes;
}

// 미리보기 상단 요약 (파생값 — 저장하지 않는다)
export function summarizeTransition(changes: readonly TransitionChange[], selectedCount: number) {
  return {
    selected: selectedCount,
    gradeChanged: changes.filter((change) => change.grade !== null).length,
    groupChanged: changes.filter(
      (change) => change.fromGroupId !== null || change.toGroupId !== null,
    ).length,
    unchanged: selectedCount - changes.length,
  };
}
