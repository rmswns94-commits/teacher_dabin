-- 학생 약점 노트 + 복습 큐 (additive/idempotent).
-- Teacher가 명시적으로 등록한 약점만 저장한다 — 관찰값(집중/단어점수 등)으로 자동 생성하지 않는다.
-- 같은 제목이 여러 번 등록돼도 병합하지 않는다 (record 단위 독립 — unique 제약 없음).
create table if not exists public.student_weaknesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 학생 삭제 시 약점 노트도 함께 삭제 (membership과 동일한 cascade — 학생 없는 약점은 무의미)
  student_id uuid not null references public.students(id) on delete cascade,
  -- 반/일지는 출처 참고용 링크 — 삭제돼도 약점 기록 자체는 보존한다
  group_id uuid references public.class_groups(id) on delete set null,
  source_daily_log_id uuid references public.daily_logs(id) on delete set null,
  category text not null
    check (category in (
      'grammar', 'vocabulary', 'reading', 'listening',
      'writing', 'pronunciation', 'homework', 'other'
    )),
  title text not null,
  note text,
  -- 다음에 다시 확인할 날짜 (KST date). 지나도 자동 변경하지 않는다 — 복습 큐에 계속 남는다.
  review_due_date date,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- 학생 상세: 학생별 약점 한 번에 조회
create index if not exists student_weaknesses_user_student_idx
  on public.student_weaknesses (user_id, student_id, status, created_at desc);
-- 복습 큐: active + due 지난 항목 batch 조회 (Dashboard)
create index if not exists student_weaknesses_review_queue_idx
  on public.student_weaknesses (user_id, status, review_due_date);
create index if not exists student_weaknesses_source_log_idx
  on public.student_weaknesses (source_daily_log_id);
create index if not exists student_weaknesses_group_idx
  on public.student_weaknesses (group_id);

drop trigger if exists student_weaknesses_updated_at on public.student_weaknesses;
create trigger student_weaknesses_updated_at
before update on public.student_weaknesses
for each row execute function public.handle_updated_at();

alter table public.student_weaknesses enable row level security;

drop policy if exists "student_weaknesses_select_own" on public.student_weaknesses;
create policy "student_weaknesses_select_own" on public.student_weaknesses
for select using (auth.uid() = user_id);

drop policy if exists "student_weaknesses_insert_own" on public.student_weaknesses;
create policy "student_weaknesses_insert_own" on public.student_weaknesses
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = student_weaknesses.student_id and s.user_id = auth.uid()
  ) and
  (
    student_weaknesses.group_id is null or
    exists (
      select 1 from public.class_groups g
      where g.id = student_weaknesses.group_id and g.user_id = auth.uid()
    )
  ) and
  (
    student_weaknesses.source_daily_log_id is null or
    exists (
      select 1 from public.daily_logs d
      where d.id = student_weaknesses.source_daily_log_id and d.user_id = auth.uid()
    )
  )
);

drop policy if exists "student_weaknesses_update_own" on public.student_weaknesses;
create policy "student_weaknesses_update_own" on public.student_weaknesses
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "student_weaknesses_delete_own" on public.student_weaknesses;
create policy "student_weaknesses_delete_own" on public.student_weaknesses
for delete using (auth.uid() = user_id);
