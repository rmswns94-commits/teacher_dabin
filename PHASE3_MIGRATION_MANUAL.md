# Phase 3 Supabase Migration 수동 적용 가이드

## 상황
- Phase 3 코드(수업 일지 / 출결 / 보충수업)가 작성 완료됨
- 새 migration이 아직 원격 Supabase DB에 적용되지 않음
- migration 파일: `supabase/migrations/20260831_create_lesson_log_schema.sql`

## 적용 방법: Supabase SQL Editor
1. https://app.supabase.com 접속 → 프로젝트 선택
2. 좌측 "SQL Editor" → "+ New query"
3. `supabase/migrations/20260831_create_lesson_log_schema.sql` 파일 내용 **전체**를 복사해서 붙여넣기
4. RUN 클릭 → "Success" 확인

## 만들어지는 것
- 테이블: `daily_logs`, `student_lesson_logs`, `makeup_lessons`
- enum: `attendance_status`, `daily_log_status`, `makeup_status`
- 세 테이블 모두 RLS 활성화 + 소유자 전용 정책 (관계 테이블 소유권 교차 검증 포함)
- 중복 방지: 일지당 학생 기록 1개(`daily_log_id, student_id` unique), 결석 기록당 보충수업 1개(`student_lesson_log_id` unique)

## 주의
- 이 migration은 Phase 2 스키마(`students`, `class_groups`)와 `handle_updated_at()` 함수가 이미 적용돼 있어야 함 (적용 확인됨)
- `create type`은 재실행 시 "already exists" 에러가 남 → 이미 적용된 상태라는 뜻이므로 안전함

## 적용 후 확인
1. localhost:3000 로그인 → 대시보드에 "오늘 수업 0개" 정상 표시
2. /daily-logs → "오늘 수업 기록하기" → 그룹 선택 → 학생 자동 로딩
3. 출결/진도/코멘트 입력 → 저장 → 새로고침 후 유지 확인
4. 결석 + 보충 필요 학생 저장 → /makeups 에 자동 생성 확인
