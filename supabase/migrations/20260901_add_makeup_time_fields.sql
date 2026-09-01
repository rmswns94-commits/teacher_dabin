-- 보충수업 예정 시간 (additive, idempotent).
-- scheduled_date는 이미 존재하며, 시각만 새로 추가한다.
alter table public.makeup_lessons
  add column if not exists start_time time,
  add column if not exists end_time time;

-- 캘린더 월 조회용 (user + scheduled_date 범위 검색)
create index if not exists makeup_lessons_user_scheduled_idx
  on public.makeup_lessons (user_id, scheduled_date);
