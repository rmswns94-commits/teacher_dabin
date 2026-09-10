-- 시험 대비용 교재 (시험 기간 ON일 때 쓰는 별도 교재 목록).
-- [{ "id": "<uuid>", "name": "백발백중 중2" }] — 등록 순서 유지, id는 안정 식별자
-- (preparation_items/daily_logs.tasks와 같은 이 프로젝트의 jsonb 목록 패턴).
--
-- 일반 교재(class_groups.textbook, 줄바꿈 구분 text)와 완전히 별개의 컬럼이라
-- 시험 기간 ON/OFF가 일반 교재를 바꾸지 않고, OFF로 되돌려도 이 목록은 그대로 남는다.
-- additive 1컬럼 — 기존 데이터 backfill/변환 없음.
alter table public.class_groups
  add column if not exists exam_textbooks jsonb;
