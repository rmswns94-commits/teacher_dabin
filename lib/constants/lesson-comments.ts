// 학생 평가 칭찬/보완 빠른 문구 (수업일지 학생 카드 [칭찬 한 표 +] / [약점 기록 +]).
// 향후 사용자별 커스텀 템플릿으로 확장할 때 이 상수를 DB 기반으로 교체한다.
//
// 저장 (schema 변경 없음 — 같은 내용을 두 곳에 저장하지 않는다):
// - 칭찬 한 표 + = "잘한 부분" 기록. 칭찬 1개 = student_praises row 1개 (기존 칭찬 한표 저장소).
//   예전 "잘한 부분" 텍스트(student_lesson_logs.strengths)는 새로 쓰지 않고, 칭찬 영역에 "이전 기록"으로 그대로 보여준다.
// - 약점 기록 + = "보완할 부분" 기록. student_lesson_logs.improvements에 한 줄에 하나씩 저장한다.
//   예전 자유 텍스트는 고치지 않고 그대로 한 항목으로 읽힌다 (줄바꿈이 있으면 줄마다 한 항목).
// 문구는 기록 도우미일 뿐 — 숙제/재시험/성장왕/온라인 복습/Todo와 연결하지 않는다.

export const PRAISE_PRESETS = [
  "숙제를 잘해왔어요",
  "단어 암기가 좋았어요",
  "문법 이해가 좋았어요",
  "독해를 잘했어요",
  "집중해서 참여했어요",
  "발표를 적극적으로 했어요",
  "질문을 잘했어요",
  "수업 태도가 좋았어요",
  "끝까지 노력했어요",
  "복습을 잘했어요",
] as const;

export const IMPROVEMENT_PRESETS = [
  "단어 복습이 필요해요",
  "문법 복습이 필요해요",
  "독해 복습이 필요해요",
  "숙제 보완이 필요해요",
  "집중력이 조금 더 필요해요",
  "수업 참여가 조금 더 필요해요",
  "문제 풀이 연습이 필요해요",
  "오답 복습이 필요해요",
  "기본 개념 복습이 필요해요",
  "복습 습관이 필요해요",
] as const;

// 보완 항목 텍스트(한 줄 = 한 항목) ↔ 목록. 빈 줄은 버리고, 같은 문구(trim 후 완전 일치)는 한 번만.
export function parseNoteItems(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const item = line.trim();
    if (item && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function joinNoteItems(items: readonly string[]): string {
  return parseNoteItems(items.join("\n")).join("\n");
}

// 같은 수업·같은 학생 안 중복 방지 — trim + 완전 일치 (유사 문구 매칭 없음)
export function toggleNoteItem(items: readonly string[], text: string): string[] {
  const item = text.trim();
  if (!item) {
    return [...items];
  }
  return items.includes(item) ? items.filter((existing) => existing !== item) : [...items, item];
}

export function addNoteItem(items: readonly string[], text: string): string[] {
  const item = text.trim();
  return !item || items.includes(item) ? [...items] : [...items, item];
}
