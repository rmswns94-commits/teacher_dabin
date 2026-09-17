-- 정규수업 1회 "다른 날짜로 이동" 지원 (additive, idempotent).
--
-- 배경: 기존 예외는 같은 날짜 안의 휴강/시간 변경만 표현했다. 실제 운영에서는
-- "이번 주 목요일 수업을 토요일 16:00에 한다"처럼 날짜 자체를 옮기는 경우가 있다.
--
-- 표현: 한 row로 "원래 occurrence → 새 날짜/시간"을 담는다.
--   kind='moved', occurrence_date=원래 날짜, moved_to_date=옮긴 날짜, start/end=옮긴 시간
--   → 원래 날짜에서는 그 수업이 사라지고(자동 휴강), 옮긴 날짜에 그 시간으로 나타난다.
-- 되돌리기는 이 row 하나만 지우면 되고, 반복 시간표는 여전히 손대지 않는다.
--
-- 기존 데이터: 컬럼 추가 + check 교체뿐. 기존 cancelled/time_override row는 그대로 유효하다
-- (moved_to_date는 null).

alter table public.class_schedule_exceptions
  add column if not exists moved_to_date date;

-- kind 허용값에 'moved' 추가 (inline check 교체)
alter table public.class_schedule_exceptions
  drop constraint if exists class_schedule_exceptions_kind_check;
alter table public.class_schedule_exceptions
  add constraint class_schedule_exceptions_kind_check
  check (kind in ('cancelled', 'time_override', 'moved'));

-- 종류별 필드 조합 규칙:
--   cancelled     : 시간/이동 날짜 없음
--   time_override : 같은 날짜의 시간만 (이동 날짜 없음)
--   moved         : 옮긴 날짜 + 옮긴 시간 필수, 원래 날짜와 같은 날짜로는 이동 불가
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
  );

-- 같은 수업이 같은 날짜로 두 번 옮겨오지 않도록 (부분 unique)
create unique index if not exists class_schedule_exceptions_moved_target_idx
  on public.class_schedule_exceptions (schedule_id, moved_to_date)
  where moved_to_date is not null;

-- "이 날짜로 옮겨온 수업" 조회용 (대시보드/캘린더의 날짜 range batch)
create index if not exists class_schedule_exceptions_user_moved_date_idx
  on public.class_schedule_exceptions (user_id, moved_to_date);
