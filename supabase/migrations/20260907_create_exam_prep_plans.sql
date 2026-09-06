-- 시험 대비 월간 플래너의 날짜별 계획 (additive/idempotent).
-- 학교 시험(school_exam_details)에 종속 — 시험 삭제 시 계획도 함께 정리(cascade).
-- Teacher가 직접 등록한 계획만 저장한다. Todo 자동 생성 없음(계획은 Todo가 아님).
create table if not exists public.exam_prep_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_exam_id uuid not null references public.school_exam_details(id) on delete cascade,
  plan_date date not null,
  -- 단원 구분 (예: "5과") — 단순 text field 유지 (UI grouping 때문에 schema를 복잡하게 만들지 않는다)
  unit_label text,
  title text not null,
  memo text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 시험별 월간 플래너 batch 조회 (날짜 cell별 쿼리 금지)
create index if not exists exam_prep_plans_exam_date_idx
  on public.exam_prep_plans (school_exam_id, plan_date, created_at);
create index if not exists exam_prep_plans_user_idx
  on public.exam_prep_plans (user_id);

drop trigger if exists exam_prep_plans_updated_at on public.exam_prep_plans;
create trigger exam_prep_plans_updated_at
before update on public.exam_prep_plans
for each row execute function public.handle_updated_at();

alter table public.exam_prep_plans enable row level security;

drop policy if exists "exam_prep_plans_select_own" on public.exam_prep_plans;
create policy "exam_prep_plans_select_own" on public.exam_prep_plans
for select using (auth.uid() = user_id);

drop policy if exists "exam_prep_plans_insert_own" on public.exam_prep_plans;
create policy "exam_prep_plans_insert_own" on public.exam_prep_plans
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.school_exam_details d
    where d.id = exam_prep_plans.school_exam_id and d.user_id = auth.uid()
  )
);

drop policy if exists "exam_prep_plans_update_own" on public.exam_prep_plans;
create policy "exam_prep_plans_update_own" on public.exam_prep_plans
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "exam_prep_plans_delete_own" on public.exam_prep_plans;
create policy "exam_prep_plans_delete_own" on public.exam_prep_plans
for delete using (auth.uid() = user_id);
