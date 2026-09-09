import { addDaysStr } from "@/lib/calendar";

// Daily Log "해야 할 일" 다중 항목 공용 헬퍼.
// - 항목은 stable id 기준 (array index 금지 — 삭제/재정렬에도 Todo가 섞이지 않게)
// - 저장은 daily_logs.tasks jsonb [{ id, textbook, content, dueDate }]
// - Todo(공용 preparation 항목)는 항목당 최대 1개 — id로 소유를 표현한다:
//     legacy 단일 항목("legacy") → "task-{dailyLogId}"  (기존 Todo id 계승 — duplicate 방지)
//     다중 항목                → "task-{dailyLogId}-{taskId}"

export type DailyLogTaskItem = {
  id: string; // stable task id ("legacy" = 기존 단일 해야 할 일에서 온 항목)
  textbook?: string | null; // 연결 교재 이름 스냅샷 (없으면 내용만 표시)
  school?: string | null; // 시험 기간 ON 당시 학교 context (textbook과 배타적)
  content: string; // 여러 줄 가능 — 전체가 Todo 하나 (줄 수만큼 쪼개지 않는다)
  dueDate?: string | null; // 명시 날짜 — 비우면 수업일 + 1일
};

// Todo 등록 조건: 의미 있는 내용이 있는 항목만 (교재/날짜만 있는 항목은 Todo 없음)
export function meaningfulDailyLogTasks<T extends { content: string }>(tasks: T[]): T[] {
  return tasks.filter((task) => task.content.trim().length > 0);
}

// due date resolver — 명시 날짜 우선, 없으면 "수업일 + 1일" (실제 오늘 + 1이 아님).
// lessonDate는 YYYY-MM-DD date-only, addDaysStr은 UTC 정오 고정이라 타임존 밀림이 없다.
export function resolveDailyLogTaskDueDate(
  explicitDueDate: string | null | undefined,
  lessonDate: string,
): string {
  return explicitDueDate || addDaysStr(lessonDate, 1);
}

export function dailyLogTaskTodoId(dailyLogId: string, taskId: string): string {
  return taskId === "legacy" ? `task-${dailyLogId}` : `task-${dailyLogId}-${taskId}`;
}

// 이 일지가 소유한 task Todo인지 (legacy 단일 id 포함) — manual/다른 source는 절대 매칭 안 됨
export function isDailyLogTaskTodoId(itemId: string, dailyLogId: string): boolean {
  return itemId === `task-${dailyLogId}` || itemId.startsWith(`task-${dailyLogId}-`);
}
