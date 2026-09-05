-- 오늘 숙제에 선택적 날짜를 붙여, 다음 수업 계획처럼 해당 날짜의 To Do로 노출한다.
alter table public.daily_logs
  add column if not exists homework_due_date date;
