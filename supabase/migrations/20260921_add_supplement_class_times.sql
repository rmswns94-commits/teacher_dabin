-- 보강(Group 1회성 수업)에 시간 추가 — additive, idempotent.
--
-- 배경: 지금까지 '보강'은 calendar_events 의 event_type='makeup' 일반 일정이었다.
-- 날짜와 반만 있고 시간이 없어서 달력 메모에 가까웠다. 실제 그 날 1회 진행하는
-- 수업으로 쓰려면 시작/종료 시각이 필요하다.
--
-- 설계:
-- - 새 테이블을 만들지 않는다. 기존 calendar_events 를 그대로 쓰고 시간 두 컬럼만 더한다.
-- - 컬럼은 nullable 이다. 기존에 등록해 둔 보강 일정(시간 없음)은 그대로 유효하며
--   예전처럼 일정 표시로만 남는다 (삭제/추측 backfill 없음).
-- - "1회성 그룹 수업"으로 취급하는 조건은 앱이 판정한다:
--     event_type='makeup' + group_id 있음 + start_time/end_time 있음 + 하루짜리(start_date=end_date)
--   이 조건을 만족하는 일정만 대시보드/수업일지에서 실제 수업으로 잡힌다.
-- - 반복 시간표(class_group_schedules)와 1회 예외(class_schedule_exceptions)는 건드리지 않는다.
-- - 학생 개인 보충(makeup_lessons)과는 전혀 다른 테이블이다. 여기서는 그쪽을 손대지 않는다.
--
-- 기존 데이터: 컬럼 추가뿐. 기존 일정/수업/일지 변경 없음.

alter table public.calendar_events
  add column if not exists start_time time;
alter table public.calendar_events
  add column if not exists end_time time;

-- 시간을 넣는다면 둘 다, 그리고 시작 < 종료여야 한다.
-- (둘 다 null 인 기존 일정은 그대로 통과한다.)
alter table public.calendar_events
  drop constraint if exists calendar_events_time_pair_check;
alter table public.calendar_events
  add constraint calendar_events_time_pair_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  );

-- 대시보드/달력은 "이 날짜에 실제 수업인 보강"을 날짜 범위로 batch 조회한다.
-- 부분 인덱스라 일반 일정에는 부담을 주지 않는다.
create index if not exists calendar_events_supplement_idx
  on public.calendar_events (user_id, start_date)
  where event_type = 'makeup' and group_id is not null and start_time is not null;
