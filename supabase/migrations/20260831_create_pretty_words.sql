-- "이쁜 말♥": 강사가 직접 모으는 개인 문장 다이어리.

create table if not exists public.pretty_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  author text,
  category text check (category in ('comfort', 'encouragement', 'teaching', 'love', 'life', 'other')),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pretty_words_user_created_idx on public.pretty_words (user_id, created_at desc);

create trigger pretty_words_updated_at
before update on public.pretty_words
for each row execute function public.handle_updated_at();

alter table public.pretty_words enable row level security;

create policy "pretty_words_select_own" on public.pretty_words
for select using (auth.uid() = user_id);

create policy "pretty_words_insert_own" on public.pretty_words
for insert with check (auth.uid() = user_id);

create policy "pretty_words_update_own" on public.pretty_words
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "pretty_words_delete_own" on public.pretty_words
for delete using (auth.uid() = user_id);
