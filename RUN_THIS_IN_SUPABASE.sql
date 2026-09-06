-- ────────────────────────────────────────────────────────────────
-- 대기 중인 migration 2개 (2026-09-06)
-- Supabase Dashboard → SQL Editor → 아래 전체를 붙여넣고 Run
-- 실행 전까지는 수업일지 저장(작성/수정)이 실패합니다.
-- 여러 번 실행해도 안전합니다 (if not exists).
-- ────────────────────────────────────────────────────────────────

-- 1) 오늘 숙제 날짜 (20260906_add_homework_due_date.sql)
alter table public.daily_logs
  add column if not exists homework_due_date date;

-- 2) 수업 회고 (20260906_add_lesson_reflection.sql)
alter table public.daily_logs
  add column if not exists reflection_good text,
  add column if not exists reflection_hard text,
  add column if not exists reflection_next text;
