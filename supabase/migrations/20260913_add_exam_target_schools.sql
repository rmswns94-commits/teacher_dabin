-- 시험 대비를 학교별로 부분 적용하기 위한 1단계: 그룹의 "시험 대상 학교" 저장.
-- 이름 배열 스냅샷 (학교는 first-class entity가 아니라 Student.school 문자열이므로
-- 별도 테이블/관계 없이 그룹 행에 최소 구조로 둔다 — exam_textbooks와 같은 원칙).
--
-- NULL = 아직 시험 대상 학교를 명시적으로 설정하지 않은 상태 (legacy 포함).
-- 기존 시험 대비 ON 그룹을 전부 대상으로 자동 backfill하지 않기 위해
-- default '{}' 없이 nullable로 둔다. OFF로 꺼도 이 값은 지우지 않는다(재활성화 prefill용).
alter table public.class_groups
  add column if not exists exam_target_schools text[];
