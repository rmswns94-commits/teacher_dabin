-- 학생별 수업 관찰값 확장: 질문/배려/노력 (additive, nullable — 미입력은 평가 제외)
-- 8개 왕 판정은 코드 rule engine이 이 구조화된 값으로 자동 계산한다.
alter table public.student_lesson_logs
  add column if not exists question_level text
    check (question_level is null or question_level in ('high', 'normal', 'low')),
  add column if not exists kindness_level text
    check (kindness_level is null or kindness_level in ('good', 'normal', 'poor')),
  add column if not exists effort_level text
    check (effort_level is null or effort_level in ('high', 'normal', 'low'));
