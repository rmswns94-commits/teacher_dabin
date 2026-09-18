-- 학생/학부모 상담 기록 — additive, idempotent.
--
-- 설계
-- - 상담은 학생에게 귀속된다. 반(class_groups)이나 수업(daily_logs)과 연결하지 않는다:
--   학생이 반을 옮겨도 상담 기록은 그대로여야 하고, 상담은 수업 기록이 아니기 때문이다.
-- - calendar_events의 'consultation'(상담 일정)과는 별개다. 그쪽은 강사 달력의 일정이고,
--   이 테이블은 "무슨 이야기를 했는지" 남기는 기록이다. 서로 만들거나 지우지 않는다.
-- - 상담 날짜는 KST date-only (앱의 다른 date 컬럼과 동일 규약). 시간은 선택이다 —
--   모르면 날짜만 남긴다 (created_at을 상담 시각처럼 쓰지 않기 위해 분리한다).
-- - 대상/방식은 새 Postgres ENUM 대신 기존 테이블들과 같은 text + check 패턴이다.
-- - 후속 메모는 그냥 text다. 할 일/알림/마감일을 만들지 않는다 (그 기능은 이 테이블 밖).
-- - 학생 이름/학교/전화번호를 복제 저장하지 않는다 — 개인정보 중복을 만들지 않고
--   표시에는 students의 현재 값을 쓴다 (이름이 바뀌어도 relation은 student_id로 유지).
--
-- 기존 데이터: 새 테이블 추가와 초기화 함수 본문 갱신뿐. 기존 row 변경/삭제 없음.
-- 선행: 20260920_create_workspaces.sql, 20260920_scope_data_to_workspaces.sql

create table if not exists public.student_consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 학원(Workspace) 단위 격리 — 다른 업무 테이블과 같은 방식
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces(id) on delete cascade,
  -- 상담 대상 학생. 학생을 지우면 상담 기록도 함께 사라진다 (다른 학생 기록에는 영향 없음)
  student_id uuid not null references public.students(id) on delete cascade,
  -- 상담한 날 (KST date-only)
  consultation_date date not null,
  -- 상담 시각 (선택) — 모르면 null
  consultation_time time,
  -- 누구와 상담했는가
  target text not null check (target in ('student', 'parent')),
  -- 어떻게 상담했는가
  method text not null check (method in ('in_person', 'phone', 'message', 'online', 'other')),
  -- 한 줄 요약 (목록에서 바로 보이는 제목)
  summary text not null check (length(btrim(summary)) > 0),
  -- 상담 내용 (여러 줄, 줄바꿈 보존)
  content text not null check (length(btrim(content)) > 0),
  -- 후속 메모 (선택) — 단순 text. 할 일/알림으로 바뀌지 않는다
  follow_up_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 조회 패턴은 "이 학생의 상담을 최신순으로" 하나다.
create index if not exists student_consultations_student_date_idx
  on public.student_consultations (student_id, consultation_date desc);

-- 학원 격리 정책이 항상 workspace_id로 필터하므로 함께 인덱스를 둔다
-- (다른 업무 테이블들과 같은 구성).
create index if not exists student_consultations_workspace_idx
  on public.student_consultations (workspace_id);

drop trigger if exists student_consultations_updated_at on public.student_consultations;
create trigger student_consultations_updated_at
  before update on public.student_consultations
  for each row execute function public.handle_updated_at();

alter table public.student_consultations enable row level security;

-- 본인 기록만 읽고 쓴다.
drop policy if exists "student_consultations_select_own" on public.student_consultations;
create policy "student_consultations_select_own" on public.student_consultations
for select using (auth.uid() = user_id);

drop policy if exists "student_consultations_insert_own" on public.student_consultations;
create policy "student_consultations_insert_own" on public.student_consultations
for insert with check (auth.uid() = user_id);

drop policy if exists "student_consultations_update_own" on public.student_consultations;
create policy "student_consultations_update_own" on public.student_consultations
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "student_consultations_delete_own" on public.student_consultations;
create policy "student_consultations_delete_own" on public.student_consultations
for delete using (auth.uid() = user_id);

-- 학원 격리 (다른 업무 테이블과 동일한 restrictive 정책).
-- 활성 학원이 아닌 학원의 상담은 읽지도 쓰지도 못한다.
drop policy if exists "student_consultations_workspace_scope" on public.student_consultations;
create policy "student_consultations_workspace_scope" on public.student_consultations
as restrictive
for all
using (workspace_id = public.current_workspace_id())
with check (workspace_id = public.current_workspace_id());

-- 다른 학원 학생에게 상담을 붙이지 못하게 한다. 학생 자체가 학원 격리 대상이라
-- 활성 학원의 학생만 조회되며, 여기서 한 번 더 명시적으로 확인한다.
drop policy if exists "student_consultations_student_scope" on public.student_consultations;
create policy "student_consultations_student_scope" on public.student_consultations
as restrictive
for all
using (
  exists (
    select 1 from public.students s
     where s.id = student_id
       and s.user_id = auth.uid()
       and s.workspace_id = workspace_id
  )
)
with check (
  exists (
    select 1 from public.students s
     where s.id = student_id
       and s.user_id = auth.uid()
       and s.workspace_id = workspace_id
  )
);

-- 데이터 초기화(설정 > 저장된 데이터 전부 초기화)에 새 테이블을 포함한다.
-- security invoker라 위 restrictive 정책이 그대로 적용되어 현재 활성 학원의 row만 지워진다.
-- 기존 삭제 순서/정책은 그대로 두고 상담만 추가한다 (students보다 먼저 지운다).
create or replace function public.reset_teacher_workspace()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Daily Log 하위 데이터 (draft/성장기록/오답단어/칭찬/보완포인트/숙제/학생평가)
  delete from public.daily_log_drafts where user_id = v_user;
  delete from public.student_growth_checks where user_id = v_user;
  delete from public.vocab_mistakes where user_id = v_user;
  delete from public.student_praises where user_id = v_user;
  delete from public.student_weaknesses where user_id = v_user;
  delete from public.daily_log_homework_assignments where user_id = v_user;
  delete from public.student_lesson_logs where user_id = v_user;

  -- 상담 기록 (학생보다 먼저 — 학생 삭제 전에 정리한다)
  delete from public.student_consultations where user_id = v_user;

  -- 보충 → 일지 (일지가 지워져야 class_groups restrict가 풀린다)
  delete from public.makeup_lessons where user_id = v_user;
  delete from public.daily_logs where user_id = v_user;

  -- 시험 대비 (계획 → 대상 학생 → 시험 상세 → 캘린더 이벤트)
  delete from public.exam_prep_plans where user_id = v_user;
  delete from public.school_exam_students where user_id = v_user;
  delete from public.school_exam_details where user_id = v_user;
  delete from public.calendar_events where user_id = v_user;

  -- 학원 전체 휴강일 (그룹/스케줄과 FK가 없어 순서는 자유)
  delete from public.academy_closures where user_id = v_user;

  -- 그룹/학생 구조 (1회 예외 → 스케줄 → 소속 → 학생 → 그룹;
  -- 할 일은 class_groups.preparation_items라 함께 삭제됨)
  delete from public.class_schedule_exceptions where user_id = v_user;
  delete from public.class_group_schedules where user_id = v_user;
  delete from public.student_group_memberships where user_id = v_user;
  delete from public.students where user_id = v_user;
  delete from public.class_groups where user_id = v_user;

  -- 이쁜 말 모음 (사용자가 앱에서 입력한 데이터)
  delete from public.pretty_words where user_id = v_user;
end;
$$;

revoke all on function public.reset_teacher_workspace() from public;
revoke all on function public.reset_teacher_workspace() from anon;
grant execute on function public.reset_teacher_workspace() to authenticated;
