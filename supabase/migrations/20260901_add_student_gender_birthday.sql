-- 학생 성별/생일 추가. 기존 row는 null로 유지되는 additive 변경.

alter table public.students
  add column if not exists gender text check (gender in ('male', 'female'));

alter table public.students
  add column if not exists birth_date date;
