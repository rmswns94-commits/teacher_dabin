-- 오늘 숙제(구조화): 한 수업(daily_log)에서 여러 숙제를 각각의 완료일(due_date)로 기록한다.
-- 학생들에게 내준 assignment 기록 — Teacher Todo/calendar_events와 무관 (자동 생성 없음).
-- 반 전체 대상이라 student_id 없음 (학생별 수행 평가는 기존 student_lesson_logs.homework_status).
-- group_id는 daily_log에서 파생 가능하므로 중복 저장하지 않는다.
create table if not exists public.daily_log_homework_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  content text not null,
  due_date date not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_log_homework_assignments_log_idx
  on public.daily_log_homework_assignments (daily_log_id);

create index if not exists daily_log_homework_assignments_user_due_idx
  on public.daily_log_homework_assignments (user_id, due_date);

drop trigger if exists daily_log_homework_assignments_updated_at on public.daily_log_homework_assignments;
create trigger daily_log_homework_assignments_updated_at
before update on public.daily_log_homework_assignments
for each row execute function public.handle_updated_at();

alter table public.daily_log_homework_assignments enable row level security;

drop policy if exists "daily_log_homework_assignments_select_own" on public.daily_log_homework_assignments;
create policy "daily_log_homework_assignments_select_own" on public.daily_log_homework_assignments
for select using (auth.uid() = user_id);

drop policy if exists "daily_log_homework_assignments_insert_own" on public.daily_log_homework_assignments;
create policy "daily_log_homework_assignments_insert_own" on public.daily_log_homework_assignments
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.daily_logs d
    where d.id = daily_log_homework_assignments.daily_log_id and d.user_id = auth.uid()
  )
);

drop policy if exists "daily_log_homework_assignments_update_own" on public.daily_log_homework_assignments;
create policy "daily_log_homework_assignments_update_own" on public.daily_log_homework_assignments
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "daily_log_homework_assignments_delete_own" on public.daily_log_homework_assignments;
create policy "daily_log_homework_assignments_delete_own" on public.daily_log_homework_assignments
for delete using (auth.uid() = user_id);
