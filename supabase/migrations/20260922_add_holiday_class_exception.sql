-- 공휴일에도 정상 수업하는 예외 추가 — additive, idempotent.
--
-- 배경: 대한민국 공휴일에는 정규수업이 기본으로 휴강된다. 다만 학원은 공휴일에도
-- 수업할 수 있으므로, "이 반의 이 날 수업은 공휴일이어도 정상 진행" 이라는 예외가 필요하다.
--
-- 설계:
-- - 새 테이블을 만들지 않는다. 기존 class_schedule_exceptions 에 kind 하나만 더한다.
--     kind='holiday_class' : occurrence_date 의 공휴일 기본 휴강을 이 occurrence만 해제
--   identity 는 기존과 같은 (schedule_id, occurrence_date) 이라 한 occurrence에 예외는 최대 하나다.
--   즉 "휴강"과 "공휴일에도 수업"이 동시에 존재할 수 없다(구조적 모순 방지).
-- - 시간 정보는 쓰지 않는다(반복 시간표의 원래 시각 그대로 진행). cancelled 와 같은 형태다.
-- - 공휴일 날짜 자체는 저장하지 않는다. 그건 달력 사실이라 앱이 계산하고,
--   DB에는 "기본 규칙을 뒤집은 예외"만 남긴다.
-- - workspace_id 기본값/RLS/소유 정책은 기존 테이블 것을 그대로 따른다(학원별 분리 자동).
--
-- 기존 데이터: check 제약 교체뿐. 기존 예외 row는 그대로 유효하다.

alter table public.class_schedule_exceptions
  drop constraint if exists class_schedule_exceptions_kind_check;
alter table public.class_schedule_exceptions
  add constraint class_schedule_exceptions_kind_check
  check (kind in ('cancelled', 'time_override', 'moved', 'holiday_class'));

-- 종류별 필드 조합 규칙 (holiday_class 추가 — cancelled 와 동일하게 시간/이동 날짜 없음)
alter table public.class_schedule_exceptions
  drop constraint if exists class_schedule_exceptions_kind_times_check;
alter table public.class_schedule_exceptions
  add constraint class_schedule_exceptions_kind_times_check check (
    (kind = 'cancelled' and start_time is null and end_time is null and moved_to_date is null)
    or (
      kind = 'time_override'
      and start_time is not null and end_time is not null and start_time < end_time
      and moved_to_date is null
    )
    or (
      kind = 'moved'
      and start_time is not null and end_time is not null and start_time < end_time
      and moved_to_date is not null and moved_to_date <> occurrence_date
    )
    or (
      kind = 'holiday_class'
      and start_time is null and end_time is null and moved_to_date is null
    )
  );
