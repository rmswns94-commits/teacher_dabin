-- 보충 수업 직접 등록 (additive/idempotent — 기존 결석 연동 보충 흐름은 그대로).
-- 같은 makeup_lessons 테이블을 재사용하고 두 컬럼만 추가한다:
-- - source: 결석 연동('absence') vs 직접 등록('manual') 구분.
--   (student_lesson_log_id null만으로는 구분 불가 — 일지 삭제 시 SET NULL로 끊긴
--    기존 완료 이력도 null이기 때문. 문자열/제목 추측 금지 정책에 따라 명시 컬럼 사용)
-- - group_id: 직접 등록 보충의 수업 그룹. 기존 결석 연동은 일지 경유로 그룹을 파생하므로
--   legacy row는 null 그대로 둔다 (backfill 없음). 그룹 삭제 시 보충은 남고 링크만 해제.
alter table public.makeup_lessons
  add column if not exists source text not null default 'absence'
    check (source in ('absence', 'manual'));

alter table public.makeup_lessons
  add column if not exists group_id uuid references public.class_groups(id) on delete set null;

create index if not exists makeup_lessons_group_id_idx
  on public.makeup_lessons (group_id);

-- insert/update 정책 재생성: 기존 검증(학생/lesson log 소유) + group_id 소유 검증 추가
drop policy if exists "makeup_lessons_insert_own" on public.makeup_lessons;
create policy "makeup_lessons_insert_own" on public.makeup_lessons
for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = makeup_lessons.student_id and s.user_id = auth.uid()
  ) and
  (
    makeup_lessons.student_lesson_log_id is null or
    exists (
      select 1 from public.student_lesson_logs l
      where l.id = makeup_lessons.student_lesson_log_id and l.user_id = auth.uid()
    )
  ) and
  (
    makeup_lessons.group_id is null or
    exists (
      select 1 from public.class_groups g
      where g.id = makeup_lessons.group_id and g.user_id = auth.uid()
    )
  )
);

drop policy if exists "makeup_lessons_update_own" on public.makeup_lessons;
create policy "makeup_lessons_update_own" on public.makeup_lessons
for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and
  exists (
    select 1 from public.students s
    where s.id = makeup_lessons.student_id and s.user_id = auth.uid()
  ) and
  (
    makeup_lessons.student_lesson_log_id is null or
    exists (
      select 1 from public.student_lesson_logs l
      where l.id = makeup_lessons.student_lesson_log_id and l.user_id = auth.uid()
    )
  ) and
  (
    makeup_lessons.group_id is null or
    exists (
      select 1 from public.class_groups g
      where g.id = makeup_lessons.group_id and g.user_id = auth.uid()
    )
  )
);
