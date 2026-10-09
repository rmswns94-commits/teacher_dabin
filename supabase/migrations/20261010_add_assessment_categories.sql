-- 빠른 체크 시험 종류 확장 (단어 + 문법 + 독해) — additive / idempotent.
--
-- 단어시험은 기존 전용 컬럼을 그대로 쓴다 (daily_logs.vocab_total, student_lesson_logs.vocab_correct/vocab_retest).
-- 지금까지 저장된 시험 기록은 전부 단어시험이므로 backfill/재작성 없이 그대로 단어로 읽힌다.
--
-- 문법/독해는 category key(grammar | reading)로 묶인 jsonb에 같은 결과 모델로 저장한다:
--   daily_logs.assessment_totals          {"grammar": 15, "reading": 10}            (총 문항, 시험 없는 category는 key 없음)
--   student_lesson_logs.assessment_results {"grammar": {"correct": 13, "retest": false}}
-- NULL = 문법/독해 시험 없음. 형식 검증은 앱(lib/assessments)이 한다 — enum/새 테이블 없음.
-- RLS: 기존 행 단위 정책(user_id + workspace)이 그대로 적용된다 (컬럼 추가만, 정책 변경 없음).

alter table public.daily_logs
  add column if not exists assessment_totals jsonb;

alter table public.student_lesson_logs
  add column if not exists assessment_results jsonb;

comment on column public.daily_logs.assessment_totals is
  '문법/독해 시험 총 문항 {"grammar": n, "reading": n}. 단어시험은 vocab_total. NULL = 문법/독해 시험 없음.';
comment on column public.student_lesson_logs.assessment_results is
  '문법/독해 시험 학생 결과 {"grammar": {"correct": n, "retest": bool}}. 단어시험은 vocab_correct/vocab_retest.';

-- 검증:
--   select table_name, column_name, data_type from information_schema.columns
--    where table_schema = 'public' and column_name in ('assessment_totals', 'assessment_results');
--   -- 기존 행은 전부 NULL (backfill 없음), 기존 단어시험 값은 그대로:
--   select count(*) from public.daily_logs where assessment_totals is not null;            -- 0
--   select count(*) from public.student_lesson_logs where assessment_results is not null;  -- 0
--   select count(*) from public.student_lesson_logs where vocab_correct is not null;       -- 적용 전과 같은 값
