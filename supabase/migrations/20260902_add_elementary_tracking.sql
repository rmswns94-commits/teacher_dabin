-- 초등 학생 관리 기능 (additive, idempotent)
-- 1) 수업 단위 단어시험 총 문항
alter table public.daily_logs
  add column if not exists vocab_total integer check (vocab_total is null or vocab_total > 0);

-- 2) 학생별 수업 기록 확장 (기존 unique(daily_log_id, student_id) 그대로 재사용)
alter table public.student_lesson_logs
  add column if not exists homework_status text
    check (homework_status is null or homework_status in ('completed', 'partial', 'missing')),
  add column if not exists vocab_correct integer
    check (vocab_correct is null or vocab_correct >= 0),
  add column if not exists vocab_retest boolean not null default false,
  add column if not exists focus_level text
    check (focus_level is null or focus_level in ('good', 'normal', 'distracted')),
  add column if not exists participation_level text
    check (participation_level is null or participation_level in ('active', 'normal', 'passive')),
  add column if not exists parent_note text,
  add column if not exists parent_note_status text
    check (parent_note_status is null or parent_note_status in ('pending', 'completed')),
  add column if not exists parent_note_completed_at timestamptz;

-- 3) 칭찬 기록 (누적 이벤트라 별도 테이블)
create table if not exists public.student_praises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  daily_log_id uuid references public.daily_logs(id) on delete set null,
  category text not null
    check (category in ('homework', 'focus', 'participation', 'vocabulary', 'kindness', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists student_praises_user_student_idx
  on public.student_praises (user_id, student_id, created_at desc);
create index if not exists student_praises_daily_log_idx
  on public.student_praises (daily_log_id);

alter table public.student_praises enable row level security;

drop policy if exists "student_praises_select_own" on public.student_praises;
create policy "student_praises_select_own" on public.student_praises
for select using (auth.uid() = user_id);

drop policy if exists "student_praises_insert_own" on public.student_praises;
create policy "student_praises_insert_own" on public.student_praises
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = student_praises.student_id and s.user_id = auth.uid()
  )
);

drop policy if exists "student_praises_update_own" on public.student_praises;
create policy "student_praises_update_own" on public.student_praises
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "student_praises_delete_own" on public.student_praises;
create policy "student_praises_delete_own" on public.student_praises
for delete using (auth.uid() = user_id);
