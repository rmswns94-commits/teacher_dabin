-- 학원(Workspace) 단위 업무 데이터 분리 — PHASE 2/3: 컬럼 추가 + 기존 데이터 backfill + 격리.
-- (20260920_create_workspaces.sql 를 먼저 실행해야 한다.)
--
-- 핵심 방침
-- - 기존 데이터는 한 줄도 삭제하거나 다른 학원으로 옮기지 않는다. 사용자마다 학원 1개를 만들어
--   현재 데이터를 전부 거기에 연결할 뿐이다. 적용 직후 화면에 보이는 내용은 적용 전과 동일하다.
-- - 격리는 앱 쿼리(213곳)를 고쳐서가 아니라 **RLS restrictive 정책**으로 강제한다.
--   필터를 한 곳이라도 빠뜨리면 다른 학원 데이터가 새는 구조를 애초에 만들지 않기 위해서다.
--   기존 permissive 정책(auth.uid() = user_id 등)은 그대로 두고, 학원 조건만 AND로 덧붙인다.
-- - workspace_id 기본값이 현재 활성 학원이라 INSERT 경로도 수정 없이 올바른 학원에 저장된다.
--   다른 학원 id를 명시해 넣으려 하면 with check에 걸려 거부된다.
--
-- 대상에서 제외한 테이블
-- - beta_feedback: 앱 자체에 대한 피드백(계정 단위 데이터). 기존에도 초기화 대상이 아니다.
--
-- 안전: 이 파일은 DROP TABLE/TRUNCATE/DELETE 를 하지 않는다. 컬럼·인덱스·정책 추가와
-- academy_closures unique 재정의(데이터 보존)만 한다. 여러 번 실행해도 안전하다.

-- ── 1) 기존 사용자마다 학원 1개 ────────────────────────────────────────────────
-- 이름은 추측하지 않는다(앱 어디에도 학원 이름을 저장한 적이 없다). 중립적인 기본값을 쓴다.
-- 첫 학원의 id는 사용자 id와 같게 둔다 (앱의 부트스트랩 생성과 같은 규약 — 중복 방지).
insert into public.workspaces (id, user_id, name)
select u.id, u.id, '내 학원'
from auth.users u
where not exists (select 1 from public.workspaces w where w.user_id = u.id)
on conflict (id) do nothing;

-- ── 2) 업무 테이블에 workspace_id 추가 → backfill → 기본값/NOT NULL → 격리 정책 ──
do $$
declare
  t text;
  business_tables text[] := array[
    'students',
    'class_groups',
    'student_group_memberships',
    'daily_logs',
    'student_lesson_logs',
    'makeup_lessons',
    'class_group_schedules',
    'pretty_words',
    'calendar_events',
    'student_praises',
    'student_growth_checks',
    'daily_log_drafts',
    'student_weaknesses',
    'vocab_mistakes',
    'school_exam_details',
    'school_exam_students',
    'exam_prep_plans',
    'daily_log_homework_assignments',
    'class_schedule_exceptions',
    'academy_closures'
  ];
begin
  foreach t in array business_tables loop
    -- 컬럼 추가 (nullable로 먼저 — 기존 row가 깨지지 않게)
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade',
      t
    );

    -- 기존 데이터를 그 사용자의 학원에 연결 (이 시점에 사용자당 학원은 정확히 1개)
    execute format(
      'update public.%I d set workspace_id = w.id
         from public.workspaces w
        where w.user_id = d.user_id and d.workspace_id is null',
      t
    );

    -- 새로 들어오는 row는 현재 활성 학원으로 (앱의 INSERT payload 수정 불필요)
    execute format(
      'alter table public.%I alter column workspace_id set default public.current_workspace_id()',
      t
    );

    -- 위 backfill로 빈 값이 없으므로 이제 필수로 (학원 없는 업무 데이터 방지)
    execute format('alter table public.%I alter column workspace_id set not null', t);

    execute format(
      'create index if not exists %I on public.%I (workspace_id)',
      t || '_workspace_idx', t
    );

    -- 격리 정책: 기존 정책은 건드리지 않고 restrictive 조건만 AND로 추가한다.
    -- select/insert/update/delete 전부에 적용된다.
    execute format('drop policy if exists %I on public.%I', t || '_workspace_scope', t);
    execute format(
      'create policy %I on public.%I
         as restrictive
         for all
         using (workspace_id = public.current_workspace_id())
         with check (workspace_id = public.current_workspace_id())',
      t || '_workspace_scope', t
    );
  end loop;
end;
$$;

-- ── 3) 사용자 단위였던 unique를 학원 단위로 ──────────────────────────────────
-- academy_closures 는 (user_id, closure_date) 였다. 학원이 여러 개면 같은 날짜를
-- 학원마다 따로 휴강할 수 있어야 하므로 학원 단위로 바꾼다. (데이터는 그대로 유지)
alter table public.academy_closures
  drop constraint if exists academy_closures_user_id_closure_date_key;
create unique index if not exists academy_closures_workspace_date_key
  on public.academy_closures (workspace_id, closure_date);

-- 나머지 unique 들은 이미 학원 단위로 안전하다:
--   daily_logs (user_id, group_id, class_date) / daily_log_drafts partial unique 들은
--   group_id·daily_log_id 가 학원 하나에만 속하므로 학원끼리 충돌하지 않는다.
--   student_group_memberships (student_id, group_id) 등 나머지도 동일하다.

-- ── 4) 데이터 초기화 = "현재 학원만" ────────────────────────────────────────
-- reset_teacher_workspace()는 security invoker라 위 restrictive 정책이 그대로 적용된다.
-- 즉 함수 본문을 바꾸지 않아도 현재 활성 학원의 row만 삭제되고 다른 학원은 100% 보존된다.
-- (본문 수정 없음 — 여기서는 확인만 남긴다.)
