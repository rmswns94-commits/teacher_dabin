-- 시험 기간 기능 (additive only — 기존 데이터/컬럼 변경 없음, backfill 없음).
-- class_groups.is_exam_period : 그룹별 시험 기간 ON/OFF (기본 OFF — 배포 전 동작과 동일)
-- class_groups.school         : 그룹의 학교 이름 (선택 — 시험 기간 ON일 때 숙제/계획/할 일 context)
-- daily_logs.school_plans     : 학교 context 다음 수업 계획 [{ name(학교명), text }]
-- daily_log_homework_assignments.school : 숙제의 학교 context 이름 스냅샷
-- (해야 할 일 tasks jsonb 항목과 공용 Todo의 school 필드는 jsonb 내부라 migration 불필요)
alter table public.class_groups add column if not exists is_exam_period boolean not null default false;
alter table public.class_groups add column if not exists school text;
alter table public.daily_logs add column if not exists school_plans jsonb;
alter table public.daily_log_homework_assignments add column if not exists school text;
