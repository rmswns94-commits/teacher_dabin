import { formatKoreanDate } from "@/lib/dates";

// 오늘 숙제(구조화) 공용 헬퍼.
// mirror: 구조화 숙제를 daily_logs.homework 텍스트로도 파생 기록한다 —
// 지난 숙제 카드/브리핑/그룹 요약 등 기존 free-text 소비처가 코드 변경 없이 계속 동작하게.
// homework_due_date는 이때 null로 남겨 기존 "숙제 날짜 → Teacher Todo 연동"이 발동하지 않는다.

export type HomeworkAssignmentInput = {
  id: string | null; // 기존 row id (수정 sync용) — 새 항목은 null
  content: string;
  dueDate: string; // "YYYY-MM-DD"
};

// due_date ASC(같으면 입력 순서) 정렬 사본
export function sortAssignments<T extends { dueDate: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate) || a.index - b.index)
    .map(({ item }) => item);
}

// 파생 텍스트: "9월 11일까지 · 내용" 줄들 (완료일 오름차순, 내용의 내부 \n 유지)
export function buildHomeworkMirror(items: { content: string; dueDate: string }[]): string {
  return sortAssignments(items)
    .map((item) => `${formatKoreanDate(item.dueDate)}까지 · ${item.content.trim()}`)
    .join("\n");
}
