-- Daily Log "해야 할 일" 다중 항목 (additive only — 기존 데이터/컬럼 변경 없음).
-- daily_logs.tasks : [{ "id", "textbook", "content", "dueDate" }] — stable id 기반 항목들.
-- 기존 단일 task_content/task_due_date/task_textbook 컬럼은 보존되며(legacy 표시/미러),
-- 기존 값을 자동 변환(backfill)하지 않는다 — 폼이 열 때 항목 1개로 보여줄 뿐이다.
alter table public.daily_logs add column if not exists tasks jsonb;
