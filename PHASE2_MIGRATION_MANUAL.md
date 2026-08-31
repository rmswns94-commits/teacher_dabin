# Phase 2 Supabase Migration 수동 적용 가이드

## 상황
- Phase 2 코드 (학생/그룹 관리)가 컴파일 완료됨
- Supabase 데이터베이스 migration이 아직 적용되지 않음
- migration 파일: `supabase/migrations/20260831_create_student_group_schema.sql`

## 해결 방법: Supabase SQL Editor에서 직접 실행

### Step 1: Supabase 대시보드 접속
1. https://app.supabase.com 접속
2. 로그인 (이메일: rm_dab@naver.com 또는 GitHub)
3. Project "dabin-teacher-diary" 선택

### Step 2: SQL Editor 열기
1. 좌측 사이드바에서 "SQL Editor" 클릭
2. "+ New query" 클릭

### Step 3: Migration SQL 복사 및 붙여넣기
다음 SQL을 전체 복사해서 SQL Editor에 붙여넣으세요:

```sql
create extension if not exists pgcrypto;

create type public.grade_level as enum ('middle_1', 'middle_2', 'middle_3', 'high_1');

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade public.grade_level not null,
  school text,
  memo text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade public.grade_level not null,
  memo text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_group_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  group_id uuid not null references public.class_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, group_id)
);

create index if not exists students_user_id_idx on public.students (user_id, archived);
create index if not exists class_groups_user_id_idx on public.class_groups (user_id, archived);
create index if not exists student_group_memberships_student_idx on public.student_group_memberships (student_id);
create index if not exists student_group_memberships_group_idx on public.student_group_memberships (group_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger students_updated_at
before update on public.students
for each row execute function public.handle_updated_at();

create trigger class_groups_updated_at
before update on public.class_groups
for each row execute function public.handle_updated_at();

alter table public.students enable row level security;
alter table public.class_groups enable row level security;
alter table public.student_group_memberships enable row level security;

create policy "students_select_own" on public.students
for select using (auth.uid() = user_id);

create policy "students_insert_own" on public.students
for insert with check (auth.uid() = user_id);

create policy "students_update_own" on public.students
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "students_delete_own" on public.students
for delete using (auth.uid() = user_id);

create policy "class_groups_select_own" on public.class_groups
for select using (auth.uid() = user_id);

create policy "class_groups_insert_own" on public.class_groups
for insert with check (auth.uid() = user_id);

create policy "class_groups_update_own" on public.class_groups
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "class_groups_delete_own" on public.class_groups
for delete using (auth.uid() = user_id);

create policy "student_group_memberships_select_own" on public.student_group_memberships
for select using (auth.uid() = user_id);

create policy "student_group_memberships_insert_own" on public.student_group_memberships
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = student_group_memberships.student_id and s.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.class_groups g
    where g.id = student_group_memberships.group_id and g.user_id = auth.uid()
  )
);

create policy "student_group_memberships_update_own" on public.student_group_memberships
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "student_group_memberships_delete_own" on public.student_group_memberships
for delete using (auth.uid() = user_id);
```

### Step 4: 실행
- "RUN" 버튼 클릭
- 성공 메시지 확인: "Query executed successfully"

## 그 이후 단계
1. localhost:3000에서 회원가입 수행
2. 로그인 후 /students 페이지로 이동
3. "학생 추가" 폼에서 학생 등록
4. /groups 페이지에서 수업 그룹 생성
5. 그룹에 학생 추가 및 멤버십 관리
6. 로그아웃 후 재로그인하여 데이터 유지 확인

## 문제 해결
- 테이블이 이미 존재한다는 에러 → 안전함 (idempotent migration)
- RLS 정책 충돌 → 정책은 IF NOT EXISTS로 보호되지 않으니 필요시 수동 삭제 후 재실행
