-- 수업 회고(강사 자기 성찰): 오늘 잘된 점 / 아쉬웠던 점 / 다음에 다르게 해볼 것.
-- 전부 선택 입력(nullable). Teacher 전용 — 성장노트(학생 화면) 쿼리에서는 select하지 않는다.
alter table public.daily_logs
  add column if not exists reflection_good text,
  add column if not exists reflection_hard text,
  add column if not exists reflection_next text;
