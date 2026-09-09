-- 교재 연동 확장 (additive only — 기존 데이터/컬럼 변경 없음).
-- 교재는 class_groups.textbook(이름 목록)이 canonical이고 id 체계가 없으므로,
-- 일지에는 작성 시점 이름 스냅샷을 저장한다 (교재명이 나중에 바뀌어도 과거 기록 보존).
--
-- daily_logs.textbook_progress : [{ "name": "...", "text": "..." }] — 교재별 진도
-- daily_logs.textbook_plans    : [{ "name": "...", "text": "..." }] — 교재별 다음 수업 계획
-- daily_logs.task_textbook     : 해야 할 일에 연결한 교재 이름 (없으면 null)
-- daily_log_homework_assignments.textbook : 숙제에 연결한 교재 이름 (없으면 null)
alter table public.daily_logs add column if not exists textbook_progress jsonb;
alter table public.daily_logs add column if not exists textbook_plans jsonb;
alter table public.daily_logs add column if not exists task_textbook text;
alter table public.daily_log_homework_assignments add column if not exists textbook text;
