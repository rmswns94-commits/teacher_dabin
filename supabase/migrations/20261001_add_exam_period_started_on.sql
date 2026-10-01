-- 시험 대비 모드 자동 종료(AUTO EXAM MODE OFF)를 위한 최소 additive metadata.
--
-- class_groups.exam_period_started_on : 사용자가 시험 대비를 직접 ON한 날짜(KST, date-only).
-- - ON은 항상 사용자의 명시적 action(startExamPeriodAction)에서만 기록한다. 자동 ON은 없다.
-- - 자동 OFF resolver는 이 날짜를 anchor로 "현재 ON 세션과 관련된 시험 cycle"
--   (학교 시험 record의 연도/학기/종류 중, 시작일 이후 가장 먼저 끝나는 cycle)을 고르고,
--   현재 roster 학생들의 모든 학교가 그 cycle 종료일을 지났을 때(today KST > end_date)만 OFF한다.
--   → 몇 달 뒤 기말고사 때문에 ON이 유지되거나, 자동 OFF 뒤 다시 ON했을 때 지난 시험을 보고
--     즉시 꺼지는 문제를 막는다.
-- - NULL = 이 migration 전에 ON한 그룹(legacy) 또는 OFF 상태. NULL이면 자동 OFF하지 않는다(직접 OFF만).
-- - OFF(수동/자동) 시 값을 지우지 않는다 — 다음 ON 때 덮어쓴다. 다른 컬럼/행/RLS 변경 없음.
--
-- 적용 순서: 이 파일 1개만 Supabase SQL Editor에서 실행 (additive, idempotent). 기존 데이터 불변.

alter table public.class_groups
  add column if not exists exam_period_started_on date;

comment on column public.class_groups.exam_period_started_on is
  '시험 대비 모드를 사용자가 ON한 날짜(KST). 자동 OFF resolver의 현재 시험 cycle anchor. NULL이면 자동 OFF 안 함.';

-- 검증:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'class_groups' and column_name = 'exam_period_started_on';
--   -- 기존 행은 전부 NULL이어야 한다 (backfill 없음):
--   select count(*) from public.class_groups where exam_period_started_on is not null;  -- 0
