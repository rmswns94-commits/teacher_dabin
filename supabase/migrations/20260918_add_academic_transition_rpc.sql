-- 학기·학년 전환 마법사의 batch 적용 (additive, idempotent).
--
-- 왜 필요한가:
-- - 학생 수십 명의 "현재 학년 + 현재 소속"을 한 번에 바꾸는 작업이라, 클라이언트에서
--   학생마다 순차 update/insert를 하면 중간 실패 시 절반만 새 학년이 되는 상태가 생긴다.
--   이 함수는 전체를 한 트랜잭션으로 처리한다 — 하나라도 실패하면 전부 rollback.
--
-- 무엇을 바꾸는가 (현재 상태만):
-- - students.grade (선택한 학생의 현재 학년)
-- - student_group_memberships (선택한 기존 소속 1건 종료 + 새 소속 1건 추가)
-- 과거 일지/출결/평가/숙제/보충/성장/시험 기록은 조회조차 하지 않는다 — backfill 없음.
-- 학생 status(재원/휴원/퇴원)도 변경하지 않는다 (PHASE 1의 명시적 액션 전용).
--
-- 보안:
-- - user id를 인자로 받지 않는다. 내부에서 auth.uid()만 사용하므로 다른 교사의 학생/그룹은
--   구조적으로 변경할 수 없다. SECURITY INVOKER라 기존 RLS(students_update_own,
--   student_group_memberships_insert/delete_own)가 이중으로 그대로 적용된다.
-- - 대상 학생/그룹의 소유권을 함수 안에서도 명시적으로 확인한다.
-- - search_path 고정, authenticated에게만 EXECUTE.
--
-- payload 형식 (jsonb array):
-- [{ "student_id": uuid, "grade": text|null, "from_group_id": uuid|null, "to_group_id": uuid|null }]
--   grade null        = 학년 변경 없음
--   from_group_id null= 종료할 기존 소속 없음
--   to_group_id null  = 추가할 새 소속 없음
-- 반환값: 적용된 학생 수.

create or replace function public.apply_academic_transition(p_changes jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_student uuid;
  v_grade text;
  v_from uuid;
  v_to uuid;
  v_applied integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'invalid payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_changes)
  loop
    v_student := nullif(v_item->>'student_id', '')::uuid;
    v_grade := nullif(v_item->>'grade', '');
    v_from := nullif(v_item->>'from_group_id', '')::uuid;
    v_to := nullif(v_item->>'to_group_id', '')::uuid;

    if v_student is null then
      raise exception 'student_id required';
    end if;

    -- 대상 학생 소유권 확인 (다른 교사의 학생이면 여기서 전체 rollback)
    if not exists (
      select 1 from public.students
      where id = v_student and user_id = v_user
    ) then
      raise exception 'student not found';
    end if;

    -- 1) 현재 학년 변경 (요청된 경우에만)
    if v_grade is not null then
      update public.students
        set grade = v_grade::public.grade_level
        where id = v_student and user_id = v_user;
    end if;

    -- 2) 기존 소속 종료 — 지정한 그룹 하나만 (다른 동시 소속은 건드리지 않는다)
    if v_from is not null then
      delete from public.student_group_memberships
        where user_id = v_user and student_id = v_student and group_id = v_from;
    end if;

    -- 3) 새 소속 추가 — 그룹 소유권 확인 후, 이미 소속이면 조용히 유지 (중복 방지/재실행 안전)
    if v_to is not null then
      if not exists (
        select 1 from public.class_groups
        where id = v_to and user_id = v_user
      ) then
        raise exception 'group not found';
      end if;

      insert into public.student_group_memberships (user_id, student_id, group_id)
        values (v_user, v_student, v_to)
        on conflict (student_id, group_id) do nothing;
    end if;

    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$$;

-- 권한: 로그인 사용자만 실행 가능 (anonymous/public 금지)
revoke all on function public.apply_academic_transition(jsonb) from public;
revoke all on function public.apply_academic_transition(jsonb) from anon;
grant execute on function public.apply_academic_transition(jsonb) to authenticated;
