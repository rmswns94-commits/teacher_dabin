-- 출결 상태에 '조퇴(early_leave)' 추가.
-- additive only: 기존 enum 값/기존 데이터/컬럼 정의는 전혀 변경하지 않는다.
-- (attendance_status는 student_lesson_logs.attendance가 쓰는 enum — 20260831 migration 참고)
alter type public.attendance_status add value if not exists 'early_leave';
