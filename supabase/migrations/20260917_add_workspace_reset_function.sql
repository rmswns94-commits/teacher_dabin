-- 저장된 데이터 전부 초기화 (Settings > 데이터 관리) — 현재 로그인 사용자 소유 업무 데이터만
-- 한 번의 함수 호출(단일 트랜잭션)로 삭제한다. 중간 실패 시 전체 rollback — 절반 삭제 없음.
--
-- 삭제하지 않는 것: auth.users(계정/로그인), beta_feedback(서비스 피드백 — delete 정책도 없음).
-- user id를 인자로 받지 않는다 — 함수 내부에서 auth.uid()만 사용 (다른 사용자 삭제 원천 차단).
--
-- SECURITY INVOKER: 호출자의 권한/RLS로 실행된다. 대상 18개 테이블 전부에
-- "*_delete_own (auth.uid() = user_id)" delete 정책이 이미 존재함을 확인했으므로
-- RLS가 이중 안전망으로 그대로 적용된다. RLS 변경/비활성화 없음.
--
-- 삭제 순서는 실제 FK on delete restrict를 존중한다:
--   * student_lesson_logs / makeup_lessons (student_id → students, restrict)를
--     students보다 먼저 삭제
--   * daily_logs (group_id → class_groups, restrict)를 class_groups보다 먼저 삭제
--   * exam_prep_plans / school_exam_students → school_exam_details → calendar_events 순
-- 나머지 자식 테이블도 명시적으로 먼저 삭제한다 (cascade 맹신 없이 전 테이블 0 rows 보장).

create or replace function public.reset_teacher_workspace()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- Daily Log 하위 데이터 (draft/성장기록/오답단어/칭찬/보완포인트/숙제/학생평가)
  delete from public.daily_log_drafts where user_id = v_user;
  delete from public.student_growth_checks where user_id = v_user;
  delete from public.vocab_mistakes where user_id = v_user;
  delete from public.student_praises where user_id = v_user;
  delete from public.student_weaknesses where user_id = v_user;
  delete from public.daily_log_homework_assignments where user_id = v_user;
  delete from public.student_lesson_logs where user_id = v_user;

  -- 보충 → 일지 (일지가 지워져야 class_groups restrict가 풀린다)
  delete from public.makeup_lessons where user_id = v_user;
  delete from public.daily_logs where user_id = v_user;

  -- 시험 대비 (계획 → 대상 학생 → 시험 상세 → 캘린더 이벤트)
  delete from public.exam_prep_plans where user_id = v_user;
  delete from public.school_exam_students where user_id = v_user;
  delete from public.school_exam_details where user_id = v_user;
  delete from public.calendar_events where user_id = v_user;

  -- 그룹/학생 구조 (스케줄 → 소속 → 학생 → 그룹; 할 일은 class_groups.preparation_items라 함께 삭제됨)
  delete from public.class_group_schedules where user_id = v_user;
  delete from public.student_group_memberships where user_id = v_user;
  delete from public.students where user_id = v_user;
  delete from public.class_groups where user_id = v_user;

  -- 이쁜 말 모음 (사용자가 앱에서 입력한 데이터)
  delete from public.pretty_words where user_id = v_user;
end;
$$;

-- 권한: 로그인 사용자만 실행 가능 (anonymous/public 금지)
revoke all on function public.reset_teacher_workspace() from public;
revoke all on function public.reset_teacher_workspace() from anon;
grant execute on function public.reset_teacher_workspace() to authenticated;
