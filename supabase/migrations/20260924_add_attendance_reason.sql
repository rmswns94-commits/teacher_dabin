-- 출결 사유 메모 — additive, idempotent.
--
-- 설계
-- - 출결 상태(attendance enum: present/late/absent/early_leave)는 그대로 둔다. 사유는 상태가 아니라
--   "왜 그랬는지"를 적어두는 선택 메모라 같은 row의 nullable text 컬럼 하나면 충분하다.
-- - 학생·수업 단위 기록(student_lesson_logs)에 귀속된다. 학생 profile에 두면 수업마다 다른 사유를
--   남길 수 없고, 별도 테이블은 join·RLS·초기화를 한 벌 더 관리해야 해서 만들지 않는다.
-- - 기존 memo/strengths/improvements는 학생 평가 컬럼이라 그대로 두고 섞지 않는다.
-- - 기존 row는 전부 NULL로 남는다 — backfill/추측/상태 변경 없음.
-- - RLS·학원(Workspace) 격리·데이터 초기화는 같은 row의 기존 정책이 그대로 적용된다.
--   (컬럼 추가라 정책을 새로 만들지 않는다.) 사유 검색 기능이 없으므로 index도 두지 않는다.
--
-- 기존 데이터: 컬럼 추가뿐. 기존 row 값 변경/삭제 없음.

alter table public.student_lesson_logs
  add column if not exists attendance_reason text;

-- 확인용 (적용 후 실행):
--   select column_name, is_nullable, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'student_lesson_logs' and column_name = 'attendance_reason';
--   select count(*) from public.student_lesson_logs where attendance_reason is not null;  -- 0
