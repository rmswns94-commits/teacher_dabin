-- 시험 기간(학교 모드) 학교별 진도 스냅샷.
-- 교재별 진도(daily_logs.textbook_progress)와 대칭 구조: [{ "name": "다빈중학교", "text": "..." }]
-- name = 작성 당시 학교명 스냅샷 (schools 테이블/FK 없음 — 학생 학교가 나중에 바뀌어도 기록 불변).
-- 교재 진도에 학교명을 넣지 않기 위한 별도 컬럼 (additive, backfill 없음).
alter table public.daily_logs
  add column if not exists school_progress jsonb;
