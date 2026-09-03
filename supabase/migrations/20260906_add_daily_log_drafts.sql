-- 수업일지 자동 임시저장(draft). daily_logs와 완전히 분리된 snapshot이라
-- 임시저장이 캘린더/성장노트/그룹 진도/연동 Todo 등 final 데이터에 영향을 주지 않는다.
-- identity: 새 작성 draft = (user, group, class_date, daily_log_id null),
--           수정 draft   = (user, daily_log_id)
create table if not exists public.daily_log_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_log_id uuid references public.daily_logs(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete cascade,
  class_date date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_log_drafts_create_key
  on public.daily_log_drafts (user_id, group_id, class_date)
  where daily_log_id is null;

create unique index if not exists daily_log_drafts_edit_key
  on public.daily_log_drafts (user_id, daily_log_id)
  where daily_log_id is not null;

alter table public.daily_log_drafts enable row level security;

drop policy if exists "daily_log_drafts_select_own" on public.daily_log_drafts;
create policy "daily_log_drafts_select_own" on public.daily_log_drafts
for select using (auth.uid() = user_id);

drop policy if exists "daily_log_drafts_insert_own" on public.daily_log_drafts;
create policy "daily_log_drafts_insert_own" on public.daily_log_drafts
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_groups g
    where g.id = daily_log_drafts.group_id and g.user_id = auth.uid()
  )
);

drop policy if exists "daily_log_drafts_update_own" on public.daily_log_drafts;
create policy "daily_log_drafts_update_own" on public.daily_log_drafts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "daily_log_drafts_delete_own" on public.daily_log_drafts;
create policy "daily_log_drafts_delete_own" on public.daily_log_drafts
for delete using (auth.uid() = user_id);
