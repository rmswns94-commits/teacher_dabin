-- 수업 내용(lesson_content)을 공통 진도(default_progress)로 병합.
-- 앞으로 canonical field는 default_progress 하나이며, 앱은 lesson_content에
-- 새 값을 저장하지 않는다.
--
-- 안전 원칙:
-- - lesson_content 컬럼과 기존 값은 그대로 보존 (DROP/NULL 처리 없음 — 원본 backup)
-- - 이미 포함된 내용은 다시 append하지 않음 → 재실행해도 안전 (idempotent)
-- - 두 컬럼 모두 text 타입이라 길이 truncate 없음
-- - 공백만 있는 값은 내용으로 취급하지 않음

update public.daily_logs
set default_progress = case
  when default_progress is null or btrim(default_progress) = ''
    then btrim(lesson_content)
  else btrim(default_progress) || E'\n\n' || btrim(lesson_content)
end
where lesson_content is not null
  and btrim(lesson_content) <> ''
  and (
    default_progress is null
    or position(btrim(lesson_content) in default_progress) = 0
  );
