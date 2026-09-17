-- 학원 전체 휴강일 (date-level closure) — additive, idempotent.
--
-- 설계:
-- - 개별 수업 1회 예외(class_schedule_exceptions)와 scope가 다르다. 그쪽은 occurrence
--   (schedule_id + 날짜) 하나를 바꾸고, 이쪽은 "그 날짜 전체가 학원 휴강"을 뜻한다.
-- - 그래서 그날 수업이 몇 개든 row는 항상 1개다. 수업마다 cancelled row를 만들지 않는 이유:
--   나중에 그 요일에 반이 하나 더 생기면 그 수업도 자동으로 휴강이어야 하는데, 생성 시점의
--   수업 목록을 복사해두면 새로 생긴 수업이 누락된다.
-- - 반복 시간표(class_group_schedules)와 개별 예외 row는 절대 건드리지 않는다. 휴강일을
--   해제하면 개별 시간 변경/이동 예외가 그대로 다시 적용된다(우선순위: 학원 휴강 > 개별 예외 > 기본).
-- - KST date-only (앱의 다른 date 컬럼과 동일 규약).
--
-- 기존 데이터: 새 테이블 추가뿐. 기존 schedule/예외/일지/일정 변경 없음.
-- calendar_events의 'holiday'(휴무) 일정과는 별개다 — 그건 표시용 주석이라
-- 수업을 취소하지 않으며, 이번 변경으로 그 의미가 바뀌지도 않는다.

create table if not exists public.academy_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 학원 전체가 쉬는 날 (KST date-only)
  closure_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 한 사용자의 같은 날짜에 휴강일은 최대 하나 (중복 저장/더블 클릭 방지)
  unique (user_id, closure_date)
);

-- 조회 패턴은 전부 "사용자 + 날짜 범위"다 (대시보드 오늘~+7일, 일지 캘린더 한 달).
create index if not exists academy_closures_user_date_idx
  on public.academy_closures (user_id, closure_date);

drop trigger if exists academy_closures_updated_at on public.academy_closures;
create trigger academy_closures_updated_at
  before update on public.academy_closures
  for each row execute function public.handle_updated_at();

alter table public.academy_closures enable row level security;

-- 본인 휴강일만 읽고 쓴다 (다른 사용자의 일정에 영향 없음).
drop policy if exists "academy_closures_select_own" on public.academy_closures;
create policy "academy_closures_select_own" on public.academy_closures
for select using (auth.uid() = user_id);

drop policy if exists "academy_closures_insert_own" on public.academy_closures;
create policy "academy_closures_insert_own" on public.academy_closures
for insert with check (auth.uid() = user_id);

drop policy if exists "academy_closures_update_own" on public.academy_closures;
create policy "academy_closures_update_own" on public.academy_closures
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "academy_closures_delete_own" on public.academy_closures;
create policy "academy_closures_delete_own" on public.academy_closures
for delete using (auth.uid() = user_id);

-- 데이터 초기화(설정 > 저장된 데이터 전부 초기화)에 새 테이블을 포함한다.
-- 사용자가 직접 등록한 업무 데이터이므로 초기화 대상이며, 함수 본문만 갱신한다
-- (기존 삭제 순서/정책 동일).
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
