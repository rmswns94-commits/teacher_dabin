create extension if not exists pgcrypto;

create type public.grade_level as enum ('middle_1', 'middle_2', 'middle_3', 'high_1');

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade public.grade_level not null,
  school text,
  memo text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade public.grade_level not null,
  memo text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_group_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, group_id)
);

create index if not exists students_user_id_idx on public.students (user_id, archived);
create index if not exists class_groups_user_id_idx on public.class_groups (user_id, archived);
create index if not exists student_group_memberships_student_idx on public.student_group_memberships (student_id);
create index if not exists student_group_memberships_group_idx on public.student_group_memberships (group_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger students_updated_at
before update on public.students
for each row execute function public.handle_updated_at();

create trigger class_groups_updated_at
before update on public.class_groups
for each row execute function public.handle_updated_at();

alter table public.students enable row level security;
alter table public.class_groups enable row level security;
alter table public.student_group_memberships enable row level security;

create policy "students_select_own" on public.students
for select using (auth.uid() = user_id);

create policy "students_insert_own" on public.students
for insert with check (auth.uid() = user_id);

create policy "students_update_own" on public.students
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "students_delete_own" on public.students
for delete using (auth.uid() = user_id);

create policy "class_groups_select_own" on public.class_groups
for select using (auth.uid() = user_id);

create policy "class_groups_insert_own" on public.class_groups
for insert with check (auth.uid() = user_id);

create policy "class_groups_update_own" on public.class_groups
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "class_groups_delete_own" on public.class_groups
for delete using (auth.uid() = user_id);

create policy "student_group_memberships_select_own" on public.student_group_memberships
for select using (auth.uid() = user_id);

create policy "student_group_memberships_insert_own" on public.student_group_memberships
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = student_group_memberships.student_id and s.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.class_groups g
    where g.id = student_group_memberships.group_id and g.user_id = auth.uid()
  )
);

create policy "student_group_memberships_update_own" on public.student_group_memberships
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "student_group_memberships_delete_own" on public.student_group_memberships
for delete using (auth.uid() = user_id);
