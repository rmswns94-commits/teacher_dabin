-- 정규수업 1회 예외 (특정 날짜만 휴강 / 시간 변경) — additive, idempotent.
--
-- 설계:
-- - 반복 시간표(class_group_schedules) row는 절대 수정하지 않는다. 특정 occurrence
--   (schedule_id + occurrence_date)에만 예외를 붙이고, 예외가 없는 날짜는 기존 그대로다.
-- - occurrence identity는 schedule_id + occurrence_date다. group_id + date만으로는
--   같은 요일에 수업이 두 개인 그룹을 구분할 수 없다.
-- - 한 occurrence에는 예외가 최대 하나(unique) — 휴강과 시간 변경이 동시에 존재할 수 없고,
--   종류 변경은 새 row가 아니라 upsert/update로 처리된다.
-- - schedule_id는 on delete cascade: 반복 시간표 row가 사라지면(삭제 또는 블록 교체 =
--   delete 후 insert) 그 occurrence 예외도 의미가 없어지므로 함께 정리된다. 시간표를
--   바꾸면 미래 1회 변경이 초기화된다는 뜻이라 UI에도 안내한다(orphan 예외 방지).
-- - 지난 예외 row는 자동 삭제하지 않는다 (그날 왜 휴강/시간 변경이었는지 history).
--
-- 기존 데이터: 새 테이블 추가뿐. 기존 schedule/일지/출결 등 변경 없음.

create table if not exists public.class_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete cascade,
  -- 예외가 붙는 반복 시간표 row (stable id) — 같은 요일 복수 수업도 정확히 구분
  schedule_id uuid not null references public.class_group_schedules(id) on delete cascade,
  -- KST date-only (앱의 다른 date 컬럼과 동일 규약)
  occurrence_date date not null,
  kind text not null check (kind in ('cancelled', 'time_override')),
  -- time_override일 때만 사용 (휴강은 둘 다 null)
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 한 occurrence = 최대 하나의 예외 (중복/동시 존재 방지)
  unique (schedule_id, occurrence_date),
  constraint class_schedule_exceptions_kind_times_check check (
    (kind = 'cancelled' and start_time is null and end_time is null)
    or (
      kind = 'time_override'
      and start_time is not null
      and end_time is not null
      and start_time < end_time
    )
  )
);

-- 조회 패턴: 사용자+날짜 범위(대시보드/주간 계산), 그룹+날짜(그룹 상세의 예정된 변경)
create index if not exists class_schedule_exceptions_user_date_idx
  on public.class_schedule_exceptions (user_id, occurrence_date);
create index if not exists class_schedule_exceptions_group_date_idx
  on public.class_schedule_exceptions (group_id, occurrence_date);

drop trigger if exists class_schedule_exceptions_updated_at on public.class_schedule_exceptions;
create trigger class_schedule_exceptions_updated_at
  before update on public.class_schedule_exceptions
  for each row execute function public.handle_updated_at();

alter table public.class_schedule_exceptions enable row level security;

-- 본인 소유 예외만 읽고 쓴다. insert/update는 대상 시간표 row의 소유까지 확인한다
-- (class_group_schedules 정책과 동일한 패턴).
drop policy if exists "class_schedule_exceptions_select_own" on public.class_schedule_exceptions;
create policy "class_schedule_exceptions_select_own" on public.class_schedule_exceptions
for select using (auth.uid() = user_id);

drop policy if exists "class_schedule_exceptions_insert_own" on public.class_schedule_exceptions;
create policy "class_schedule_exceptions_insert_own" on public.class_schedule_exceptions
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_group_schedules schedule
    where schedule.id = schedule_id
      and schedule.user_id = auth.uid()
      and schedule.group_id = group_id
  )
);

drop policy if exists "class_schedule_exceptions_update_own" on public.class_schedule_exceptions;
create policy "class_schedule_exceptions_update_own" on public.class_schedule_exceptions
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.class_group_schedules schedule
    where schedule.id = schedule_id
      and schedule.user_id = auth.uid()
      and schedule.group_id = group_id
  )
);

drop policy if exists "class_schedule_exceptions_delete_own" on public.class_schedule_exceptions;
create policy "class_schedule_exceptions_delete_own" on public.class_schedule_exceptions
for delete using (auth.uid() = user_id);

-- 데이터 초기화(설정 > 저장된 데이터 전부 초기화)에 새 테이블을 포함한다.
-- 사용자가 직접 만든 업무 데이터이므로 초기화 대상이며, 함수 본문만 갱신한다
-- (기존 삭제 순서/정책 동일 — schedule보다 먼저 지워 FK 의존을 남기지 않는다).
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
