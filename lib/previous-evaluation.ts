import { attendanceLabels } from "@/lib/attendance";
import {
  effortLevelLabels,
  focusLevelLabels,
  homeworkStatusLabels,
  kindnessLevelLabels,
  participationLevelLabels,
  questionLevelLabels,
} from "@/lib/elementary";
import type {
  AttendanceStatus,
  EffortLevel,
  FocusLevel,
  HomeworkStatus,
  KindnessLevel,
  ParticipationLevel,
  QuestionLevel,
} from "@/lib/supabase/types";

// 학생 평가 카드의 "지난 수업 참고" — 같은 그룹의 직전 Finalized 일지에 저장된
// 학생 평가를 read-only로 요약한다. REFERENCE ONLY:
// - 오늘 평가 기본값으로 복사하지 않는다 (표시 전용 — 폼 state와 완전 분리).
// - null은 전부 "미평가" = 표시 제외 (fake 기본값 금지, 온라인 복습 null ≠ 미완료).
// - 라벨은 오늘 평가 UI와 같은 단일 소스(lib/elementary, lib/attendance)를 재사용한다.

export type PreviousEvaluationEntry = {
  studentId: string;
  attendance: AttendanceStatus | null;
  homeworkStatus: HomeworkStatus | null;
  focusLevel: FocusLevel | null;
  participationLevel: ParticipationLevel | null;
  questionLevel: QuestionLevel | null;
  kindnessLevel: KindnessLevel | null;
  effortLevel: EffortLevel | null;
  onlineReviewCompleted: boolean | null;
  memo: string | null;
};

// 저장값이 현재 enum 밖이어도(아주 오래된 데이터 등) raw 값을 노출하지 않고 건너뛴다.
function labelOf<K extends string>(labels: Record<K, string>, value: K | null): string | null {
  return value !== null && value in labels ? labels[value] : null;
}

// 표시용 chip 텍스트 목록 — 값이 있는 field만, 오늘 평가 UI와 같은 순서.
export function previousEvaluationChips(entry: PreviousEvaluationEntry): string[] {
  const chips: string[] = [];
  const attendance = labelOf(attendanceLabels, entry.attendance);
  if (attendance) chips.push(attendance);
  const homework = labelOf(homeworkStatusLabels, entry.homeworkStatus);
  if (homework) chips.push(`숙제 ${homework}`);
  // 온라인 복습: true=완료, false=미완료, null=미평가(표시 없음 — false로 취급 금지)
  if (entry.onlineReviewCompleted === true) chips.push("온라인 복습 완료");
  if (entry.onlineReviewCompleted === false) chips.push("온라인 복습 미완료");
  const focus = labelOf(focusLevelLabels, entry.focusLevel);
  if (focus) chips.push(`집중 ${focus}`);
  const participation = labelOf(participationLevelLabels, entry.participationLevel);
  if (participation) chips.push(`참여 ${participation}`);
  const question = labelOf(questionLevelLabels, entry.questionLevel);
  if (question) chips.push(`질문 ${question}`);
  const kindness = labelOf(kindnessLevelLabels, entry.kindnessLevel);
  if (kindness) chips.push(`배려 ${kindness}`);
  const effort = labelOf(effortLevelLabels, entry.effortLevel);
  if (effort) chips.push(`노력 ${effort}`);
  return chips;
}

export function previousEvaluationMemo(entry: PreviousEvaluationEntry): string {
  return entry.memo?.trim() ?? "";
}

// row는 있어도 의미 있는 값이 하나도 없으면 참고 영역 자체를 숨긴다
// (row 존재를 정보로 취급하지 않는다).
export function hasMeaningfulPreviousEvaluation(entry: PreviousEvaluationEntry): boolean {
  return previousEvaluationChips(entry).length > 0 || previousEvaluationMemo(entry).length > 0;
}

// student_id 기준 lookup — 이름 매칭 금지 (동명이인 안전).
export function previousEvaluationByStudent(
  entries: readonly PreviousEvaluationEntry[],
): Map<string, PreviousEvaluationEntry> {
  return new Map(entries.map((entry) => [entry.studentId, entry]));
}
