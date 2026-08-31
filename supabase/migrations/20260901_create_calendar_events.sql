-- 강사 일정(시험 기간, 휴무, 보강, 상담 등). 수업일지(daily_logs)와는 별개의
-- overlay 데이터로, 수업 스케줄(class_group_schedules)을 변경하지 않는다.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_type text not null check (
    event_type in ('exam', 'holiday', 'makeup', 'special_class', 'consultation', 'personal', 'other')
  ),
  start_date date not null,
  end_date date not null,
  -- null이면 전체 일정, 값이 있으면 특정 반 일정. 그룹이 지워져도 일정은 전체 일정으로 남는다.
  group_id uuid references public.class_groups(id) on delete set null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists calendar_events_user_range_idx
  on public.calendar_events (user_id, start_date, end_date);

create trigger calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.handle_updated_at();

alter table public.calendar_events enable row level security;

create policy "calendar_events_select_own" on public.calendar_events
for select using (auth.uid() = user_id);

create policy "calendar_events_insert_own" on public.calendar_events
for insert with check (
  auth.uid() = user_id and
  (
    calendar_events.group_id is null or
    exists (
      select 1 from public.class_groups g
      where g.id = calendar_events.group_id and g.user_id = auth.uid()
    )
  )
);

create policy "calendar_events_update_own" on public.calendar_events
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  (
    calendar_events.group_id is null or
    exists (
      select 1 from public.class_groups g
      where g.id = calendar_events.group_id and g.user_id = auth.uid()
    )
  )
);

create policy "calendar_events_delete_own" on public.calendar_events
for delete using (auth.uid() = user_id);
