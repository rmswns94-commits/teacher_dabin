-- 학생 lifecycle(재원/휴원/퇴원) 구분용 additive 컬럼 (idempotent).
--
-- 설계:
-- - 현재 roster 제외의 마스터 플래그는 기존 students.archived를 그대로 사용한다
--   (새 일지 roster/그룹 상세/성장노트/브리핑/숙제 선택이 전부 !archived 필터 —
--   기존 화면 로직 변경 없이 휴원/퇴원 모두 안전하게 제외된다).
-- - status는 제외 사유만 구분한다: 휴원 = archived=true + status='paused',
--   퇴원 = archived=true + status='withdrawn', 재원 = archived=false(+status='active').
--
-- 기존 데이터: default 'active'가 채워질 뿐 파괴적 backfill/변환 없음.
-- 과거에 archived=true였던 학생(구 '보관')은 화면에서 퇴원으로 표시된다.
-- RLS/FK 변경 없음 — 기존 students_update_own 정책이 이 컬럼 update에도 그대로 적용된다.

alter table public.students
  add column if not exists status text not null default 'active'
  check (status in ('active', 'paused', 'withdrawn'));
