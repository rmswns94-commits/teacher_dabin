-- 수업일지 중복 방지: 같은 Teacher + 같은 그룹 + 같은 날짜는 일지 1개만.
-- 서버 pre-check를 동시에 통과하는 race(더블 클릭/두 탭)를 DB 레벨에서 차단한다.
--
-- ⚠️ 실행 전 반드시 아래 SELECT로 기존 중복이 없는지 먼저 확인할 것 (0행이어야 함):
--
--   select user_id, group_id, class_date, count(*) as cnt
--   from public.daily_logs
--   group by user_id, group_id, class_date
--   having count(*) > 1;
--
-- 중복이 있으면 이 migration을 실행하지 말고 먼저 정리 방법을 상의한다
-- (자동 삭제/병합 금지 — 기존 데이터 보존).

create unique index if not exists daily_logs_user_group_date_key
  on public.daily_logs (user_id, group_id, class_date);
