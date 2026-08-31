-- Weekly class schedules per group (a group can meet multiple times a week).
-- day_of_week follows JS Date.getDay(): 0 = Sunday ... 6 = Saturday.

create table if not exists public.class_group_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (group_id, day_of_week, start_time)
);

create index if not exists class_group_schedules_user_idx on public.class_group_schedules (user_id);
create index if not exists class_group_schedules_group_idx on public.class_group_schedules (group_id);

create trigger class_group_schedules_updated_at
before update on public.class_group_schedules
for each row execute function public.handle_updated_at();

alter table public.class_group_schedules enable row level security;

create policy "class_group_schedules_select_own" on public.class_group_schedules
for select using (auth.uid() = user_id);

create policy "class_group_schedules_insert_own" on public.class_group_schedules
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_groups g
    where g.id = class_group_schedules.group_id and g.user_id = auth.uid()
  )
);

create policy "class_group_schedules_update_own" on public.class_group_schedules
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_groups g
    where g.id = class_group_schedules.group_id and g.user_id = auth.uid()
  )
);

create policy "class_group_schedules_delete_own" on public.class_group_schedules
for delete using (auth.uid() = user_id);
