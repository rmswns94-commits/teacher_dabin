-- 단어시험 오답 기록 (additive/idempotent).
-- 점수(daily_logs.vocab_total + student_lesson_logs.vocab_correct)는 기존 필드를 그대로 쓰고,
-- 이 테이블은 "그 시험에서 틀린 단어" occurrence만 저장한다.
-- 같은 일지 안에서는 코드가 정규화(소문자/공백) 기준으로 dedupe해 저장하고,
-- 다른 날짜 시험의 같은 단어는 별도 occurrence로 남긴다 (반복 오답 집계용).
create table if not exists public.vocab_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 학생 기준 history — 반 이동/그룹 변경과 무관하게 유지, 학생 삭제 시 함께 삭제
  student_id uuid not null references public.students(id) on delete cascade,
  -- 오답은 해당 시험(일지)에 종속 — 일지 삭제 시 함께 삭제 (출결/평가와 동일한 cascade)
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  word text not null,
  note text,
  created_at timestamptz not null default now()
);

-- 학생 상세: 학생별 오답 집계 batch 조회
create index if not exists vocab_mistakes_user_student_idx
  on public.vocab_mistakes (user_id, student_id, created_at desc);
-- 일지 수정 화면 복원 + final save의 delete+insert sync
create index if not exists vocab_mistakes_daily_log_idx
  on public.vocab_mistakes (daily_log_id);

alter table public.vocab_mistakes enable row level security;

drop policy if exists "vocab_mistakes_select_own" on public.vocab_mistakes;
create policy "vocab_mistakes_select_own" on public.vocab_mistakes
for select using (auth.uid() = user_id);

drop policy if exists "vocab_mistakes_insert_own" on public.vocab_mistakes;
create policy "vocab_mistakes_insert_own" on public.vocab_mistakes
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = vocab_mistakes.student_id and s.user_id = auth.uid()
  ) and
  exists (
    select 1 from public.daily_logs d
    where d.id = vocab_mistakes.daily_log_id and d.user_id = auth.uid()
  )
);

drop policy if exists "vocab_mistakes_update_own" on public.vocab_mistakes;
create policy "vocab_mistakes_update_own" on public.vocab_mistakes
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vocab_mistakes_delete_own" on public.vocab_mistakes;
create policy "vocab_mistakes_delete_own" on public.vocab_mistakes
for delete using (auth.uid() = user_id);
