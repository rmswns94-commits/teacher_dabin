-- 숙제 자체의 완료 상태. "오늘 할 일" 화면에서 숙제를 체크할 때 이 컬럼만 바뀐다.
-- 숙제를 Todo(class_groups.preparation_items)로 복제하지 않기 위한 최소 추가 —
-- 기존 row는 default false라 자연스럽게 미완료로 시작한다 (backfill 없음).
alter table public.daily_log_homework_assignments
  add column if not exists completed boolean not null default false;

-- 완료 시각 (미완료로 되돌리면 null). Todo의 completedAt과 같은 의미.
alter table public.daily_log_homework_assignments
  add column if not exists completed_at timestamptz;
