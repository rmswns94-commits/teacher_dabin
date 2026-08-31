-- Private beta feedback. Users can only write their own feedback; the app has
-- no admin UI — feedback is read directly in the Supabase dashboard.

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'ux', 'feature', 'other')),
  message text not null,
  page_path text,
  created_at timestamptz not null default now()
);

create index if not exists beta_feedback_user_idx on public.beta_feedback (user_id);

alter table public.beta_feedback enable row level security;

create policy "beta_feedback_insert_own" on public.beta_feedback
for insert with check (auth.uid() = user_id);

create policy "beta_feedback_select_own" on public.beta_feedback
for select using (auth.uid() = user_id);
