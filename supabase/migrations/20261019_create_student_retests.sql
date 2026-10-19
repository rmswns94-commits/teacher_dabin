-- 재시험 관리 — 학생 1명 × 시험 1개 단위의 재시험 lifecycle 저장소. additive, idempotent.
--
-- 왜 새 테이블인가 (RETEST_STORAGE_AUDIT = C. NEW_ADDITIVE_RETEST_STORAGE_REQUIRED)
-- - 지금까지 "재시험 필요"는 boolean 표시뿐이다:
--     student_lesson_logs.vocab_retest (이전 단어시험) / assessment_results[시험 id].retest (20261010 이후)
--   통과/미통과/통과 시각을 담을 곳이 없고, boolean을 상태값처럼 바꾸면 원래 시험 기록이 변한다.
-- - 원래 시험 결과(맞은 개수/재시험 필요 표시)는 그대로 두고, 이 테이블이 운영 상태만 관리한다.
--
-- identity
-- - 재시험 1건 = (student_lesson_log_id, assessment_id). student_lesson_logs는 (일지, 학생)마다 1 row이고
--   일지 재저장 시에도 같은 row가 유지되며(upsert), assessment_id는 일지 안의 stable 시험 id다
--   (같은 날 단어시험 2개 → 재시험 2건). 이전 형식 시험은 id 'vocabulary' / 'grammar' / 'reading'.
-- - 일지를 다시 저장해도 같은 source면 같은 row다 (unique) — 중복 생성 없음.
--
-- 상태 (새 Postgres ENUM 대신 기존 테이블들과 같은 text + check)
--   pending   = 재시험 대상, 아직 결과 확인 전 (등록 시 기본값)
--   failed    = 재시험을 봤지만 미통과 — 진행중 목록에 계속 남는다
--   passed    = 통과 — 진행중에서 빠지고 통과 기록에서 보인다 (row 삭제 없음)
--   cancelled = 수업일지에서 "재시험 필요"를 해제해 등록이 취소됨 (아직 pending이던 것만 — 보충 수업의
--               cancelled와 같은 의미). 진행중/통과 기록 어디에도 보이지 않는다.
--   진행중 = pending + failed (앱 lib/retests.ts의 단일 helper).
--   일지 재저장은 failed/passed를 절대 pending으로 되돌리지 않는다 (앱 sync 규칙).
--
-- snapshot (보충 수업 original_class_date / missed_progress와 같은 방식)
-- - 수업일·반·시험 종류·문항 수·맞은 개수·그 학생의 그 수업 진도를 등록 시점에 함께 남긴다.
--   현재 반의 최신 진도로 대신 보여주지 않기 위해서이고, 수업일지가 삭제돼도
--   미통과/통과 이력이 날짜·내용과 함께 남게 하기 위해서다.
-- - 진도는 "그 수업에서 그 학생이 나간 진도"다. 시험 범위와 직접 연결된 정보는 없으므로
--   교재 이름으로 시험 범위를 추측하지 않는다 (앱에서 "해당 수업 진도"로 표시).
--
-- FK
-- - student_id: on delete restrict — 수업 기록(student_lesson_logs)/보충과 같은 규칙. 기록이 있는 학생은
--   hard delete되지 않는다 (orphan 없음, CASCADE 없음).
-- - student_lesson_log_id: on delete set null — 보충 수업과 같은 규칙. 일지 삭제 시 앱이 처리 전(pending/cancelled)
--   재시험은 먼저 지우고, 미통과/통과 이력은 링크만 해제된 채 snapshot과 함께 보존한다.
-- - group_id: on delete set null — 등록 당시 반 snapshot.
--
-- 기존 데이터: 새 테이블 + 초기화 함수 갱신 + 기존 "재시험 필요" 표시의 backfill(pending).
-- 기존 row 변경/삭제 없음.
-- 선행: 20260920_create_workspaces.sql, 20260920_scope_data_to_workspaces.sql, 20261010_add_assessment_categories.sql

create table if not exists public.student_retests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 학원(Workspace) 단위 격리 — 다른 업무 테이블과 같은 방식
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  -- source: 그 수업의 그 학생 기록 + 그 수업 안의 시험 id
  student_lesson_log_id uuid references public.student_lesson_logs(id) on delete set null,
  assessment_id text not null check (assessment_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  category text not null check (category in ('vocabulary', 'grammar', 'reading')),
  -- 등록 당시 snapshot
  group_id uuid references public.class_groups(id) on delete set null,
  class_date date not null,
  total_questions integer check (total_questions is null or total_questions > 0),
  correct_count integer check (correct_count is null or correct_count >= 0),
  progress_snapshot text,
  -- 운영 상태
  status text not null default 'pending' check (status in ('pending', 'failed', 'passed', 'cancelled')),
  -- 마지막으로 통과/미통과를 누른 시각 (등록만 된 상태면 null)
  last_checked_at timestamptz,
  passed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 같은 학생의 같은 시험 재시험은 1건 (일지 재저장 idempotent). 일지가 삭제돼 링크가 null이 된
  -- 이력 row끼리는 충돌하지 않는다 (null은 unique 비교 대상이 아님).
  unique (student_lesson_log_id, assessment_id)
);

-- 진행중 목록(반별 집계/반 상세): status로 거르고 반/학생으로 묶는다
create index if not exists student_retests_user_status_idx
  on public.student_retests (user_id, status, class_date);
create index if not exists student_retests_student_idx
  on public.student_retests (student_id);
create index if not exists student_retests_group_idx
  on public.student_retests (group_id);
-- 통과 기록 (최근 통과순)
create index if not exists student_retests_passed_idx
  on public.student_retests (user_id, passed_at desc)
  where status = 'passed';
create index if not exists student_retests_workspace_idx
  on public.student_retests (workspace_id);

drop trigger if exists student_retests_updated_at on public.student_retests;
create trigger student_retests_updated_at
  before update on public.student_retests
  for each row execute function public.handle_updated_at();

alter table public.student_retests enable row level security;

drop policy if exists "student_retests_select_own" on public.student_retests;
create policy "student_retests_select_own" on public.student_retests
for select using (auth.uid() = user_id);

drop policy if exists "student_retests_insert_own" on public.student_retests;
create policy "student_retests_insert_own" on public.student_retests
for insert with check (auth.uid() = user_id);

drop policy if exists "student_retests_update_own" on public.student_retests;
create policy "student_retests_update_own" on public.student_retests
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "student_retests_delete_own" on public.student_retests;
create policy "student_retests_delete_own" on public.student_retests
for delete using (auth.uid() = user_id);

-- 학원 격리 (다른 업무 테이블과 동일한 restrictive 정책)
drop policy if exists "student_retests_workspace_scope" on public.student_retests;
create policy "student_retests_workspace_scope" on public.student_retests
as restrictive
for all
using (workspace_id = public.current_workspace_id())
with check (workspace_id = public.current_workspace_id());

-- 다른 학원 학생 / 다른 학원 수업 기록에 재시험을 붙이지 못하게 한다.
-- (subquery 안에서 컬럼 이름이 students/student_lesson_logs 쪽으로 해석되지 않게 table 이름으로 명시한다)
drop policy if exists "student_retests_source_scope" on public.student_retests;
create policy "student_retests_source_scope" on public.student_retests
as restrictive
for all
using (
  exists (
    select 1 from public.students s
     where s.id = student_retests.student_id
       and s.user_id = auth.uid()
       and s.workspace_id = student_retests.workspace_id
  )
  and (
    student_lesson_log_id is null
    or exists (
      select 1 from public.student_lesson_logs l
       where l.id = student_lesson_log_id
         and l.user_id = auth.uid()
         and l.student_id = student_retests.student_id
         and l.workspace_id = student_retests.workspace_id
    )
  )
)
with check (
  exists (
    select 1 from public.students s
     where s.id = student_retests.student_id
       and s.user_id = auth.uid()
       and s.workspace_id = student_retests.workspace_id
  )
  and (
    student_lesson_log_id is null
    or exists (
      select 1 from public.student_lesson_logs l
       where l.id = student_lesson_log_id
         and l.user_id = auth.uid()
         and l.student_id = student_retests.student_id
         and l.workspace_id = student_retests.workspace_id
    )
  )
);

-- ── 기존 "재시험 필요" 표시 backfill ──
-- 완료(completed) 일지의 출석 학생 중 재시험 필요로 표시된 시험만 pending으로 가져온다.
-- 통과/미통과 정보는 원래 없으므로 추측하지 않는다 (전부 pending = 아직 결과 확인 전).
-- 진도 snapshot: 학생별 진도가 있으면 그것, 없으면 일지 공통 진도. 단 학교별 진도(시험 기간)가 함께
-- 기록된 일지는 공통 진도가 다른 학교 진도와 섞여 있을 수 있어 비워둔다 (앱에서 "진도 정보 없음").
-- unique 충돌은 무시 — 몇 번 실행해도 결과가 같다.
with sources as (
  -- 시험 목록 배열 형식 (20261010 이후 저장)
  select
    dl.user_id, dl.workspace_id, dl.group_id, dl.class_date, dl.default_progress, dl.school_progress,
    sll.id as lesson_log_id, sll.student_id, sll.progress,
    e ->> 'id' as assessment_id,
    e ->> 'category' as category,
    case when jsonb_typeof(e -> 'total') = 'number' then (e ->> 'total')::numeric::integer end as total_questions,
    case when jsonb_typeof(sll.assessment_results -> (e ->> 'id') -> 'correct') = 'number'
      then (sll.assessment_results -> (e ->> 'id') ->> 'correct')::numeric::integer end as correct_count
  from public.daily_logs dl
  join public.student_lesson_logs sll on sll.daily_log_id = dl.id and sll.user_id = dl.user_id
  -- 배열이 아닌 일지에서 함수가 먼저 평가돼도 오류가 나지 않게 (planner 순서와 무관)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(dl.assessment_totals) = 'array' then dl.assessment_totals else '[]'::jsonb end
  ) e
  where dl.status = 'completed'
    and jsonb_typeof(dl.assessment_totals) = 'array'
    and sll.attendance <> 'absent'
    and jsonb_typeof(sll.assessment_results) = 'object'
    and (sll.assessment_results -> (e ->> 'id') ->> 'retest') = 'true'
  union all
  -- 이전 형식 단어시험 (vocab 컬럼)
  select
    dl.user_id, dl.workspace_id, dl.group_id, dl.class_date, dl.default_progress, dl.school_progress,
    sll.id, sll.student_id, sll.progress,
    'vocabulary', 'vocabulary', dl.vocab_total, sll.vocab_correct
  from public.daily_logs dl
  join public.student_lesson_logs sll on sll.daily_log_id = dl.id and sll.user_id = dl.user_id
  where dl.status = 'completed'
    and (dl.assessment_totals is null or jsonb_typeof(dl.assessment_totals) <> 'array')
    and sll.attendance <> 'absent'
    and sll.vocab_retest is true
  union all
  -- 이전 형식 문법/독해 ({grammar: n, reading: n} 객체)
  select
    dl.user_id, dl.workspace_id, dl.group_id, dl.class_date, dl.default_progress, dl.school_progress,
    sll.id, sll.student_id, sll.progress,
    k.category, k.category,
    case when jsonb_typeof(dl.assessment_totals -> k.category) = 'number'
      then (dl.assessment_totals ->> k.category)::numeric::integer end,
    case when jsonb_typeof(sll.assessment_results -> k.category -> 'correct') = 'number'
      then (sll.assessment_results -> k.category ->> 'correct')::numeric::integer end
  from public.daily_logs dl
  join public.student_lesson_logs sll on sll.daily_log_id = dl.id and sll.user_id = dl.user_id
  cross join (values ('grammar'), ('reading')) as k(category)
  where dl.status = 'completed'
    and jsonb_typeof(dl.assessment_totals) = 'object'
    and dl.assessment_totals ? k.category
    and sll.attendance <> 'absent'
    and jsonb_typeof(sll.assessment_results) = 'object'
    and (sll.assessment_results -> k.category ->> 'retest') = 'true'
)
insert into public.student_retests (
  user_id, workspace_id, student_id, student_lesson_log_id, assessment_id, category,
  group_id, class_date, total_questions, correct_count, progress_snapshot, status
)
select
  s.user_id, s.workspace_id, s.student_id, s.lesson_log_id, s.assessment_id, s.category,
  s.group_id, s.class_date,
  case when s.total_questions > 0 then s.total_questions end,
  case when s.correct_count >= 0 then s.correct_count end,
  coalesce(
    nullif(btrim(s.progress), ''),
    case
      when s.school_progress is null
        or jsonb_typeof(s.school_progress) <> 'array'
        or jsonb_array_length(s.school_progress) = 0
      then nullif(btrim(s.default_progress), '')
    end
  ),
  'pending'
from sources s
where s.assessment_id ~ '^[A-Za-z0-9_-]{1,64}$'
  and s.category in ('vocabulary', 'grammar', 'reading')
on conflict (student_lesson_log_id, assessment_id) do nothing;

-- 데이터 초기화(설정 > 저장된 데이터 전부 초기화)에 새 테이블을 포함한다.
-- security invoker라 restrictive 정책이 그대로 적용되어 현재 활성 학원의 row만 지워진다.
-- 기존 삭제 순서/정책은 그대로 두고 재시험만 추가한다 (학생 기록·학생보다 먼저 — student_id restrict).
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

  -- 재시험 관리 (학생 기록/학생보다 먼저)
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
--   select status, count(*) from public.student_retests group by status;          -- backfill은 전부 pending
--   -- 같은 source 중복 없음:
--   select student_lesson_log_id, assessment_id, count(*) from public.student_retests
--    group by 1, 2 having count(*) > 1;                                             -- 0 rows
--   -- 원래 시험 기록은 그대로 (backfill은 읽기만 한다):
--   select count(*) from public.student_lesson_logs where vocab_retest;              -- 적용 전과 같은 값
