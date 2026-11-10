-- 시험 대비 scope를 "학교"에서 "학교 + 학년"으로 분리한다.
--
-- 1) class_groups.exam_targets jsonb: canonical 시험 대상 scope [{school, grade}].
--    grade null = 사용자가 유지한 legacy "학교 전체" scope.
--    기존 exam_target_schools(text[])는 삭제/변경하지 않는다 — exam_targets가 null인
--    그룹에서 읽기 fallback(학교 전체 의미)으로 계속 쓰이고, 새 저장 시 호환 mirror로 갱신된다.
--
-- 2) daily_log_homework_assignments.grade: 학교 context 숙제의 학년 scope.
--    null = legacy 학교 전체 기록 (기존 row는 그대로 — 현재 학생 학년으로 backfill하지 않는다).
--
-- 진도/계획/할 일/Todo의 학년 scope는 기존 jsonb 컬럼(school_progress, school_plans,
-- tasks, preparation_items) 항목 안의 optional grade 키로 저장되므로 migration이 필요 없다.

alter table public.class_groups
  add column if not exists exam_targets jsonb;

alter table public.daily_log_homework_assignments
  add column if not exists grade text;
