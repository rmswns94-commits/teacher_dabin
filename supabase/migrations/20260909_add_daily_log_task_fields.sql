-- 해야 할 일: 다음 수업 계획(수업 내용)과 별개로 Teacher가 처리할 작업 + 날짜.
-- 일지 row가 폼 복원의 source of truth이고, [수업 기록 완료] 시에만
-- 공용 Todo(preparation_items, source='daily_log_task')로 1개 연결된다.
-- additive 컬럼 2개만 추가 (기존 데이터/컬럼 무변경).
alter table public.daily_logs
  add column if not exists task_content text,
  add column if not exists task_due_date date;
