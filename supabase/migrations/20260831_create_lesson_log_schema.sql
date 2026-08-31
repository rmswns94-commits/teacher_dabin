-- Phase 3: daily lesson logs, per-student lesson records, makeup lessons.
-- Depends on 20260831_create_student_group_schema.sql (students, class_groups).

create type public.attendance_status as enum ('present', 'late', 'absent');
create type public.daily_log_status as enum ('draft', 'completed');
create type public.makeup_status as enum ('required', 'scheduled', 'completed', 'cancelled');

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete restrict,
  class_date date not null,
  title text,
  lesson_content text,
  default_progress text,
  memo text,
  status public.daily_log_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_lesson_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  attendance public.attendance_status not null default 'present',
  progress text,
  strengths text,
  improvements text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_log_id, student_id)
);

create table if not exists public.makeup_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  student_lesson_log_id uuid references public.student_lesson_logs(id) on delete set null,
  original_class_date date not null,
  missed_progress text,
  status public.makeup_status not null default 'required',
  scheduled_date date,
  completed_date date,
  completed_progress text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one makeup record per absence record; reused when attendance flips back and forth
  unique (student_lesson_log_id)
);

create index if not exists daily_logs_user_date_idx on public.daily_logs (user_id, class_date desc);
create index if not exists daily_logs_group_idx on public.daily_logs (group_id);
create index if not exists student_lesson_logs_daily_log_idx on public.student_lesson_logs (daily_log_id);
create index if not exists student_lesson_logs_student_idx on public.student_lesson_logs (student_id);
create index if not exists student_lesson_logs_user_idx on public.student_lesson_logs (user_id);
create index if not exists makeup_lessons_user_status_idx on public.makeup_lessons (user_id, status);
create index if not exists makeup_lessons_student_idx on public.makeup_lessons (student_id);

create trigger daily_logs_updated_at
before update on public.daily_logs
for each row execute function public.handle_updated_at();

create trigger student_lesson_logs_updated_at
before update on public.student_lesson_logs
for each row execute function public.handle_updated_at();

create trigger makeup_lessons_updated_at
before update on public.makeup_lessons
for each row execute function public.handle_updated_at();

alter table public.daily_logs enable row level security;
alter table public.student_lesson_logs enable row level security;
alter table public.makeup_lessons enable row level security;

create policy "daily_logs_select_own" on public.daily_logs
for select using (auth.uid() = user_id);

create policy "daily_logs_insert_own" on public.daily_logs
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_groups g
    where g.id = daily_logs.group_id and g.user_id = auth.uid()
  )
);

create policy "daily_logs_update_own" on public.daily_logs
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_groups g
    where g.id = daily_logs.group_id and g.user_id = auth.uid()
  )
);

create policy "daily_logs_delete_own" on public.daily_logs
for delete using (auth.uid() = user_id);

create policy "student_lesson_logs_select_own" on public.student_lesson_logs
for select using (auth.uid() = user_id);

create policy "student_lesson_logs_insert_own" on public.student_lesson_logs
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.daily_logs d
    where d.id = student_lesson_logs.daily_log_id and d.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.students s
    where s.id = student_lesson_logs.student_id and s.user_id = auth.uid()
  )
);

create policy "student_lesson_logs_update_own" on public.student_lesson_logs
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.daily_logs d
    where d.id = student_lesson_logs.daily_log_id and d.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.students s
    where s.id = student_lesson_logs.student_id and s.user_id = auth.uid()
  )
);

create policy "student_lesson_logs_delete_own" on public.student_lesson_logs
for delete using (auth.uid() = user_id);

create policy "makeup_lessons_select_own" on public.makeup_lessons
for select using (auth.uid() = user_id);

create policy "makeup_lessons_insert_own" on public.makeup_lessons
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = makeup_lessons.student_id and s.user_id = auth.uid()
  ) and
  (
    makeup_lessons.student_lesson_log_id is null or
    exists (
      select 1 from public.student_lesson_logs l
      where l.id = makeup_lessons.student_lesson_log_id and l.user_id = auth.uid()
    )
  )
);

create policy "makeup_lessons_update_own" on public.makeup_lessons
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = makeup_lessons.student_id and s.user_id = auth.uid()
  ) and
  (
    makeup_lessons.student_lesson_log_id is null or
    exists (
      select 1 from public.student_lesson_logs l
      where l.id = makeup_lessons.student_lesson_log_id and l.user_id = auth.uid()
    )
  )
);

create policy "makeup_lessons_delete_own" on public.makeup_lessons
for delete using (auth.uid() = user_id);
