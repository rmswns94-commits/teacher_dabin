-- 학교별 중간·기말고사 시험 관리 (additive/idempotent).
-- 시험 날짜의 single source of truth는 기존 calendar_events(event_type='exam', date range 지원).
-- 이 테이블들은 그 event에 학교/학년/학기 metadata와 대상 학생 relation만 붙인다 —
-- Calendar/Dashboard D-30/시험 관리가 전부 같은 event row를 바라본다 (중복 event 금지).
create table if not exists public.school_exam_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 캘린더에서 exam event를 삭제하면 metadata도 함께 정리 (orphan 금지)
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  -- 등록 당시 학교명 snapshot — Student.school이 나중에 바뀌어도 시험 history는 보존된다.
  -- 같은 학교라도 학년별 시험이 다르므로 school_name 단독 unique 금지 (identity = 학교+학년+연도+학기+종류,
  -- 단 실제 학교 사정상 분리 일정이 있을 수 있어 DB unique 강제하지 않는다 — UI에서만 안내).
  school_name text not null,
  grade text not null check (grade in (
    'elementary_1', 'elementary_2', 'elementary_3', 'elementary_4', 'elementary_5', 'elementary_6',
    'middle_1', 'middle_2', 'middle_3', 'high_1'
  )),
  exam_year int not null check (exam_year between 2020 and 2100),
  semester smallint not null check (semester in (1, 2)),
  exam_type text not null check (exam_type in ('midterm', 'final', 'other')),
  -- Phase 7: free-text 시험 범위. Phase 8의 structured scope item과 공존 예정 — 삭제/변환 금지.
  scope_text text,
  memo text,
  -- Teacher 준비 상태 (예정/진행중/종료는 날짜에서 derive — DB 저장 안 함)
  prep_status text not null default 'not_started'
    check (prep_status in ('not_started', 'preparing', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_event_id)
);

create table if not exists public.school_exam_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_exam_id uuid not null references public.school_exam_details(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 같은 시험에 같은 학생 중복 연결 방지 (한 학생이 여러 시험에 연결되는 것은 허용)
  unique (school_exam_id, student_id)
);

create index if not exists school_exam_details_user_term_idx
  on public.school_exam_details (user_id, exam_year, semester);
create index if not exists school_exam_details_event_idx
  on public.school_exam_details (calendar_event_id);
create index if not exists school_exam_students_exam_idx
  on public.school_exam_students (school_exam_id);
create index if not exists school_exam_students_student_idx
  on public.school_exam_students (student_id);

drop trigger if exists school_exam_details_updated_at on public.school_exam_details;
create trigger school_exam_details_updated_at
before update on public.school_exam_details
for each row execute function public.handle_updated_at();

alter table public.school_exam_details enable row level security;
alter table public.school_exam_students enable row level security;

drop policy if exists "school_exam_details_select_own" on public.school_exam_details;
create policy "school_exam_details_select_own" on public.school_exam_details
for select using (auth.uid() = user_id);

drop policy if exists "school_exam_details_insert_own" on public.school_exam_details;
create policy "school_exam_details_insert_own" on public.school_exam_details
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.calendar_events e
    where e.id = school_exam_details.calendar_event_id and e.user_id = auth.uid()
  )
);

drop policy if exists "school_exam_details_update_own" on public.school_exam_details;
create policy "school_exam_details_update_own" on public.school_exam_details
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "school_exam_details_delete_own" on public.school_exam_details;
create policy "school_exam_details_delete_own" on public.school_exam_details
for delete using (auth.uid() = user_id);

drop policy if exists "school_exam_students_select_own" on public.school_exam_students;
create policy "school_exam_students_select_own" on public.school_exam_students
for select using (auth.uid() = user_id);

drop policy if exists "school_exam_students_insert_own" on public.school_exam_students;
create policy "school_exam_students_insert_own" on public.school_exam_students
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.school_exam_details d
    where d.id = school_exam_students.school_exam_id and d.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.students s
    where s.id = school_exam_students.student_id and s.user_id = auth.uid()
  )
);

drop policy if exists "school_exam_students_delete_own" on public.school_exam_students;
create policy "school_exam_students_delete_own" on public.school_exam_students
for delete using (auth.uid() = user_id);
