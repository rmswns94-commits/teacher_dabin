-- 다음 수업 계획의 계획 날짜 (date-only). additive — 기존 row는 null(미연동 legacy).
alter table public.daily_logs
  add column if not exists next_plan_date date;
