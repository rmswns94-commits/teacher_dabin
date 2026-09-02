-- 칭찬 한표: Teacher가 직접 남기는 짧은 칭찬 코멘트.
-- additive only — 기존 category 기반 칭찬 데이터는 그대로 보존한다.

alter table public.student_praises
  add column if not exists comment text,
  add column if not exists source text not null default 'manual_daily_log';

-- comment 길이 제한 (서버 validation과 동일한 상한의 안전망)
alter table public.student_praises
  drop constraint if exists student_praises_comment_length;
alter table public.student_praises
  add constraint student_praises_comment_length
  check (comment is null or char_length(comment) <= 200);
