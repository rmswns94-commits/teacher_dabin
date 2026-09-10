-- 오늘 숙제(구조화)의 대상: 반 공통 vs 특정 학생 1명.
-- assigned_student_id NULL = 공통 (기존 row 전부 자연스럽게 공통으로 해석 — backfill 불필요).
-- "공통"은 가짜 학생 row가 아니라 NULL로만 표현한다.
--
-- on delete set null: 학생을 지워도 과거 일지의 숙제 기록 자체는 남긴다
-- (student_lesson_logs는 on delete restrict라 삭제 자체가 막히지만, 숙제는 이력 보존이 우선).
alter table public.daily_log_homework_assignments
  add column if not exists assigned_student_id uuid null
  references public.students(id) on delete set null;

-- 특정 학생 숙제 조회용 (공통은 NULL이라 인덱스 대상 아님)
create index if not exists daily_log_homework_assignments_student_idx
  on public.daily_log_homework_assignments (assigned_student_id)
  where assigned_student_id is not null;
