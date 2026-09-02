-- 수업일지의 "오늘의 성장" 체크 (선생님 관찰 기록, additive/idempotent).
-- 최종 성취(주간 리포트) 판정은 코드의 rule이 담당하고, 이 테이블은 근거 이벤트만 저장한다.
create table if not exists public.student_growth_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  achievement_type text not null
    check (achievement_type in (
      'question_master', 'attendance_master', 'vocabulary_master', 'effort_master',
      'consistency_master', 'presentation_master', 'kindness_master', 'focus_master'
    )),
  created_at timestamptz not null default now(),
  -- 같은 수업·학생·항목은 1개만 (재시도/중복 저장 방지)
  unique (daily_log_id, student_id, achievement_type)
);

create index if not exists student_growth_checks_user_student_idx
  on public.student_growth_checks (user_id, student_id, created_at desc);
create index if not exists student_growth_checks_daily_log_idx
  on public.student_growth_checks (daily_log_id);

alter table public.student_growth_checks enable row level security;

drop policy if exists "student_growth_checks_select_own" on public.student_growth_checks;
create policy "student_growth_checks_select_own" on public.student_growth_checks
for select using (auth.uid() = user_id);

drop policy if exists "student_growth_checks_insert_own" on public.student_growth_checks;
create policy "student_growth_checks_insert_own" on public.student_growth_checks
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = student_growth_checks.student_id and s.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.daily_logs d
    where d.id = student_growth_checks.daily_log_id and d.user_id = auth.uid()
  )
);

drop policy if exists "student_growth_checks_update_own" on public.student_growth_checks;
create policy "student_growth_checks_update_own" on public.student_growth_checks
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "student_growth_checks_delete_own" on public.student_growth_checks;
create policy "student_growth_checks_delete_own" on public.student_growth_checks
for delete using (auth.uid() = user_id);
