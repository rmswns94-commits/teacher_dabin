-- 재시험 시도 점수 이력 — 재시험 1건(student_retests)에 미통과 시도가 1:N으로 쌓인다. additive, idempotent.
--
-- 왜 새 테이블인가 (RETEST_ATTEMPT_STORAGE_AUDIT = C. NEW_ADDITIVE_ATTEMPT_STORAGE_REQUIRED)
-- - student_retests에는 상태(pending/failed/passed)와 마지막 확인 시각(last_checked_at)만 있다.
--   점수 칸 하나를 두고 덮어쓰면 "미통과 1회 · 14/24" 다음 "18/24"를 저장하는 순간 이전 점수가 사라진다.
-- - 그래서 시도 1회 = row 1개 (append-only). 수정 정책(update policy)을 두지 않는다.
--
-- identity / 순서
-- - parent = retest_id (재시험 1건). 시험 종류(category)로 묶지 않는다 — 같은 날 단어시험 2개의 재시험은
--   각자 자기 이력을 가진다. 종류/원래 시험 정보는 parent에서 읽으므로 복제 저장하지 않는다.
-- - attempt_no = 같은 재시험 안에서 1, 2, 3 … (unique). 함수가 parent row를 잠근 뒤 max+1로 매겨
--   동시에 저장해도 번호가 겹치지 않는다.
-- - request_id = [미통과 저장] 요청 1회의 id. 같은 요청이 두 번 와도(더블 클릭/재전송) 시도는 1개다.
--
-- 점수 snapshot
-- - correct_count / total_questions를 시도 row에 함께 저장한다. 원래 시험의 총 문항이 나중에 바뀌어도
--   "14/24"의 24는 그대로다 (화면은 원래 시험 값으로 분모를 다시 계산하지 않는다).
-- - 0점은 유효하다. 맞은 개수 ≤ 총 문항, 총 문항 ≥ 1.
--
-- 원자성
-- - [미통과 저장]은 record_retest_failure() 한 번 — 시도 insert와 재시험 status=failed가 한 트랜잭션.
--   한쪽만 성공한 상태(시도는 있는데 대기 / 미통과인데 점수 없음)가 생기지 않는다.
--
-- 영향 없음: 원래 시험 결과(student_lesson_logs), 성장왕 계산, Todo/보충/시험 대비.
-- 기존 미통과 재시험에 가짜 시도 이력을 만들지 않는다 (backfill 없음).
-- 선행: 20261019_create_student_retests.sql

create table if not exists public.student_retest_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces(id) on delete cascade,
  -- parent 재시험. 시도가 있는 재시험(미통과/통과)은 앱이 지우지 않는다 — restrict로 이력 orphan/유실 방지
  retest_id uuid not null references public.student_retests(id) on delete restrict,
  attempt_no integer not null check (attempt_no > 0),
  -- 이번 기능은 미통과 시도만 기록한다 (통과 점수는 아직 요구사항 아님 — 나중에 check만 넓히면 된다)
  result text not null default 'failed' check (result in ('failed')),
  correct_count integer not null check (correct_count >= 0),
  total_questions integer not null check (total_questions > 0),
  attempted_at timestamptz not null default now(),
  request_id uuid,
  created_at timestamptz not null default now(),
  check (correct_count <= total_questions),
  unique (retest_id, attempt_no),
  unique (retest_id, request_id)
);

-- 반 상세/통과 기록: 화면에 보이는 재시험 id들의 시도를 한 번에 (retest_id in (...))
create index if not exists student_retest_attempts_retest_idx
  on public.student_retest_attempts (retest_id, attempt_no);
create index if not exists student_retest_attempts_workspace_idx
  on public.student_retest_attempts (workspace_id);

alter table public.student_retest_attempts enable row level security;

drop policy if exists "student_retest_attempts_select_own" on public.student_retest_attempts;
create policy "student_retest_attempts_select_own" on public.student_retest_attempts
for select using (auth.uid() = user_id);

drop policy if exists "student_retest_attempts_insert_own" on public.student_retest_attempts;
create policy "student_retest_attempts_insert_own" on public.student_retest_attempts
for insert with check (auth.uid() = user_id);

-- 삭제는 데이터 초기화(reset_teacher_workspace)용으로만 쓰인다 (앱에 시도 삭제 기능 없음).
-- update 정책은 두지 않는다 — 저장된 시도 점수는 바뀌지 않는다 (append-only).
drop policy if exists "student_retest_attempts_delete_own" on public.student_retest_attempts;
create policy "student_retest_attempts_delete_own" on public.student_retest_attempts
for delete using (auth.uid() = user_id);

drop policy if exists "student_retest_attempts_workspace_scope" on public.student_retest_attempts;
create policy "student_retest_attempts_workspace_scope" on public.student_retest_attempts
as restrictive
for all
using (workspace_id = public.current_workspace_id())
with check (workspace_id = public.current_workspace_id());

-- parent 재시험이 내 것이고 같은 학원이어야 한다 (다른 학원 재시험에 시도를 붙일 수 없다)
drop policy if exists "student_retest_attempts_parent_scope" on public.student_retest_attempts;
create policy "student_retest_attempts_parent_scope" on public.student_retest_attempts
as restrictive
for all
using (
  exists (
    select 1 from public.student_retests r
     where r.id = student_retest_attempts.retest_id
       and r.user_id = auth.uid()
       and r.workspace_id = student_retest_attempts.workspace_id
  )
)
with check (
  exists (
    select 1 from public.student_retests r
     where r.id = student_retest_attempts.retest_id
       and r.user_id = auth.uid()
       and r.workspace_id = student_retest_attempts.workspace_id
  )
);

-- [미통과 저장] — 시도 1개 추가 + 재시험 status=failed를 한 트랜잭션으로.
-- - user id/workspace id를 인자로 받지 않는다: auth.uid()와 parent 재시험의 학원만 쓴다.
-- - SECURITY INVOKER라 두 테이블의 RLS가 그대로 적용된다 (다른 학원/다른 교사 재시험은 보이지도 않는다).
-- - 진행중(pending/failed) 재시험에만 — 통과한 재시험에는 시도를 추가하지 않는다.
-- - parent row를 FOR UPDATE로 잠가 attempt_no를 직렬화한다.
-- - 같은 p_request_id가 다시 오면 새로 만들지 않고 처음 만든 시도를 그대로 돌려준다.
create or replace function public.record_retest_failure(
  p_retest_id uuid,
  p_correct_count integer,
  p_total_questions integer,
  p_request_id uuid
)
returns public.student_retest_attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_retest public.student_retests;
  v_attempt public.student_retest_attempts;
  v_next integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_total_questions is null or p_total_questions < 1
     or p_correct_count is null or p_correct_count < 0
     or p_correct_count > p_total_questions then
    raise exception 'invalid_retest_score';
  end if;

  select * into v_retest
    from public.student_retests
   where id = p_retest_id and user_id = v_user
   for update;

  if not found then
    raise exception 'retest_not_found';
  end if;

  if p_request_id is not null then
    select * into v_attempt
      from public.student_retest_attempts
     where retest_id = p_retest_id and request_id = p_request_id;
    if found then
      return v_attempt;
    end if;
  end if;

  if v_retest.status not in ('pending', 'failed') then
    raise exception 'retest_not_active';
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_next
    from public.student_retest_attempts
   where retest_id = p_retest_id;

  insert into public.student_retest_attempts (
    user_id, workspace_id, retest_id, attempt_no, result, correct_count, total_questions, request_id
  ) values (
    v_user, v_retest.workspace_id, p_retest_id, v_next, 'failed', p_correct_count, p_total_questions, p_request_id
  )
  returning * into v_attempt;

  update public.student_retests
     set status = 'failed', last_checked_at = v_attempt.attempted_at
   where id = p_retest_id and user_id = v_user;

  return v_attempt;
end;
$$;

revoke all on function public.record_retest_failure(uuid, integer, integer, uuid) from public;
revoke all on function public.record_retest_failure(uuid, integer, integer, uuid) from anon;
grant execute on function public.record_retest_failure(uuid, integer, integer, uuid) to authenticated;

-- 데이터 초기화에 시도 이력을 포함한다 (재시험보다 먼저 — retest_id restrict).
-- security invoker라 현재 활성 학원의 row만 지워진다. 나머지 삭제 순서/정책은 20261019와 같다.
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

  -- 재시험 관리 (시도 이력 → 재시험, 학생 기록/학생보다 먼저)
  delete from public.student_retest_attempts where user_id = v_user;
  delete from public.student_retests where user_id = v_user;

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

-- 검증:
--   select count(*) from public.student_retest_attempts;                              -- 적용 직후 0 (backfill 없음)
--   select retest_id, attempt_no, count(*) from public.student_retest_attempts
--    group by 1, 2 having count(*) > 1;                                                 -- 0 rows
--   select proname from pg_proc where proname = 'record_retest_failure';                -- 1 row
