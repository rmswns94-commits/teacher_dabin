-- 학원(Workspace) 단위 업무 데이터 분리 — PHASE 1: 구조 생성 (additive, idempotent).
--
-- 배경: 강사가 다른 학원으로 옮겨도 기존 학원 기록을 지우지 않고 보존한 채,
-- 새 학원에서 학생 0명 상태로 새로 시작할 수 있어야 한다. 하나의 Supabase DB 안에서
-- "한 사용자 → 여러 학원"을 표현한다 (새 프로젝트/새 계정/초기화가 아니다).
--
-- 설계:
-- - workspaces 한 테이블만 추가한다. active workspace는 별도 profiles 테이블 없이
--   activated_at 최신 row로 정한다 — 전환이 UPDATE 한 문장이라 원자적이고,
--   partial unique index의 순서 문제(한 문장 안에서 두 row가 동시에 active가 되는 구간)가 없다.
-- - 업무 데이터에는 workspace_id를 붙이고 **RLS에서 현재 활성 학원으로 강제**한다(PHASE 2).
--   그래서 앱의 기존 쿼리 213곳을 고치지 않아도 다른 학원 데이터가 새어나올 수 없다.
--   필터를 한 곳이라도 빠뜨리면 바로 데이터 유출이 되는 구조를 애초에 만들지 않는 것이 목적이다.
-- - 기존 데이터는 삭제/이동하지 않는다. 사용자마다 "기존 학원" workspace를 하나 만들어
--   현재 데이터를 전부 그 학원에 연결한다(PHASE 3 backfill).

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 표시용 이름. identity는 언제나 id다 (같은 이름의 학원이 둘 있어도 서로 다른 학원).
  name text not null,
  -- 마지막으로 이 학원을 사용한 시각. 사용자의 workspace 중 가장 최근 값이 현재 활성 학원이다.
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 활성 학원 조회 = (user_id, activated_at desc) 한 번
create index if not exists workspaces_user_activated_idx
  on public.workspaces (user_id, activated_at desc);

-- 첫(부트스트랩) 학원은 id를 사용자 id와 같게 만든다. 신규 가입자의 첫 진입에서
-- 여러 요청이 동시에 "학원 없음"을 보고 각자 INSERT 해도 PK 충돌로 하나만 남는다.
-- 사용자가 직접 만드는 두 번째 학원부터는 기본값(랜덤 uuid)을 쓴다.

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.handle_updated_at();

alter table public.workspaces enable row level security;

-- 본인 학원만 읽고 쓴다. 한 사용자가 여러 학원을 갖는 것은 정상이므로
-- workspaces 자체에는 "활성 학원" 제한을 걸지 않는다 (목록/전환에 필요).
drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own" on public.workspaces
for select using (auth.uid() = user_id);

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own" on public.workspaces
for insert with check (auth.uid() = user_id);

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own" on public.workspaces
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 삭제 정책은 두지 않는다 — 이번 단계에서 학원 삭제 기능은 만들지 않는다(기록 보존이 목적).

-- 현재 활성 학원 id. 업무 테이블의 기본값과 RLS가 모두 이 함수를 쓴다.
-- stable이라 쿼리당 한 번만 평가되고, 위 index를 그대로 탄다.
-- security invoker + search_path 고정 (기존 RPC 규약과 동일).
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select w.id
  from public.workspaces w
  where w.user_id = auth.uid()
  order by w.activated_at desc, w.created_at asc
  limit 1
$$;

revoke all on function public.current_workspace_id() from public;
revoke all on function public.current_workspace_id() from anon;
grant execute on function public.current_workspace_id() to authenticated;

-- 학원 전환 = activated_at 갱신 한 문장. 업무 데이터는 전혀 건드리지 않는다.
-- (RLS가 그대로 적용되는 security invoker라 남의 학원은 전환할 수 없다.)
create or replace function public.activate_workspace(p_workspace_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.workspaces
  set activated_at = now()
  where id = p_workspace_id and user_id = auth.uid();

  if not found then
    raise exception 'workspace not found';
  end if;
end;
$$;

revoke all on function public.activate_workspace(uuid) from public;
revoke all on function public.activate_workspace(uuid) from anon;
grant execute on function public.activate_workspace(uuid) to authenticated;
