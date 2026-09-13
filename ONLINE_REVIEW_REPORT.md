# Student Online Review Status

## 검증 결과

PASS는 로컬 코드·브라우저 또는 아래 명시한 모의 DB 검증 기준입니다. 실제 Supabase에 migration을 적용하거나 실제 학생 기록을 쓰지 않았습니다. 운영 DB 저장·재조회는 migration 적용 후 확인해야 합니다.

| 항목 | 결과 |
| --- | --- |
| Feature | Student Online Review Status |
| UI | PASS |
| Position | 연보라색 학생 평가 영역, 숙제 다음 / 단어 이전 |
| Status Model | NULL_TRUE_FALSE |
| Null Meaning | NOT_EVALUATED |
| Complete | SUPPORTED |
| Incomplete | SUPPORTED |
| Student Identity | STUDENT_ID |
| Draft Persistence | PASS |
| Autosave | PASS |
| Final Save | PASS — 실제 폼/validation/저장 함수, DB 응답 모의 |
| Edit Hydration | PASS — entry 복원·수정·재저장; edit page 매핑 코드 확인 |
| Detail Display | PASS — 실제 renderer 검증, 결석 포함 |
| Student History Display | PASS — 기존 renderer 확장 및 query/type/build 확인 |
| Existing Historical Rows | NULL_SAFE |
| Homework Coupled | NO |
| Todo Side Effect | NONE |
| Makeup Side Effect | NONE |
| Growth Rule Changed | NO |
| Parent Notice Auto Change | NO |
| N+1 | NONE |
| Form Remount | NONE — 온라인 복습 변경 시 기존 input/textarea DOM 동일성 검증 |
| Existing Evaluations Preserved | YES |
| PWA | MANUAL REQUIRED |
| iPad Landscape | MANUAL REQUIRED — 1024px Edge 레이아웃 PASS |
| iPad Portrait | MANUAL REQUIRED — 768px Edge 레이아웃 PASS |
| Split View | MANUAL REQUIRED — 507px Edge 레이아웃 PASS |
| Mobile | PASS — 390px Edge 레이아웃 |
| Supabase Action | RUN TARGETED MIGRATION |
| TypeScript | PASS |
| Lint | PASS |
| Tests | PASS |
| Build | PASS |
| Commit Hash | 최종 응답에 기재. `git log -1 --format=%H -- ONLINE_REVIEW_REPORT.md`로 조회 가능 |

## 구현 설명

1. 학생 평가 Card는 `components/daily-log-form.tsx`의 `DailyLogForm` 안에 있습니다.
2. 숙제 바로 다음에 온라인 복습 [완료] [미완료]를 배치했습니다. 기존 `SegmentedToggle`의 실제 button, aria-pressed, 키보드 및 재클릭 해제 패턴을 재사용했습니다.
3. 기존 평가는 `public.student_lesson_logs`의 개별 컬럼에 저장됩니다. Draft는 기존 `daily_log_drafts.payload` JSON에 저장됩니다.
4. 새 컬럼은 `online_review_completed`; 폼 필드는 `onlineReviewCompleted`입니다. 별도 테이블/enum/mutation을 만들지 않았습니다.
5. `null`은 미평가, `true`는 완료, `false`는 미완료입니다. 선택된 버튼을 다시 누르면 null이 됩니다.
6. 기존 Draft `entries[studentId]` 스냅샷에 새 필드가 포함됩니다. 예전 Draft의 누락 필드는 initEntry의 null 기본값을 사용합니다.
7. 기존 formStateRef에 entries가 포함되므로 온라인 복습 변경도 기존 60초 dirty autosave가 저장합니다. 새 타이머나 저장 요청을 만들지 않았습니다.
8. 기존 최종 저장 payload와 nullable/optional Zod 검증, 학생 평가 batch upsert에 필드를 추가했습니다. `?? null`을 사용해 false가 지워지지 않습니다. 컬럼 미적용 오류에는 기존 migration 안내를 적용했습니다.
9. `app/daily-logs/[id]/edit/page.tsx`에서 DB 값을 entry로 전달하며, null/누락만 null로 복원합니다.
10. `components/lesson-log-detail.tsx`와 `app/students/[id]/page.tsx`의 기존 수업 이력에 표시합니다. boolean일 때만 완료/미완료를 표시하고 미평가는 생략합니다. 일지 상세에서는 결석 여부와 무관하게 표시합니다.
11. 기존 행은 migration 후 NULL입니다. 기존 null/undefined가 미완료로 렌더링되지 않습니다. backfill이나 기존 행 UPDATE는 없습니다.
12. 숙제 평가 및 Homework.completed와 독립입니다. 숙제 미제출+복습 완료, 숙제 완료+복습 미완료 조합을 검증했습니다.
13. Todo/Makeup/약점/학부모 전달 자동 생성·변경을 추가하지 않았습니다. 실제 saveDailyLog의 모의 DB 실행에서 온라인 복습만으로 관련 insert/update가 발생하지 않음을 확인했습니다.
14. 기존 성장 판정 코드와 9개 규칙은 수정하지 않았습니다. 온라인 복습 필드를 성장 규칙에 전달하거나 점수화하지 않습니다.
15. 기존 student_id 키를 유지합니다. 학생 배열 순서를 뒤집어도 Draft가 해당 학생에게 복원됩니다. 출결 변경에도 복습 값은 보존됩니다. 결석 시 기존 폼은 수업 평가 영역을 숨기며, 출석으로 돌아오면 보존된 선택이 보입니다.
16. 기존 관계 조회의 `student_lesson_logs(*)`와 학생 이력 `select("*, ...")`를 사용하므로 추가 query가 없습니다. 3명과 20명 저장의 query 수가 같고, 학생 평가 upsert는 각각 한 번입니다.
17. 기존 flex-wrap과 간격을 유지했습니다. 온라인 복습 라벨에만 기존 w-8 고정 폭을 적용하지 않아 글자가 버튼과 겹치지 않습니다. 390/507/768/1024/1366px에서 검증했습니다.
18. 수정 파일은 아래 목록에 정리했습니다.
19. 신규 브라우저 11개 검사, 서버 저장·상세 3개 검사 그룹이 통과했습니다. 브라우저는 실제 DailyLogForm을 사용하되 server action/navigation을 테스트 경계에서 대체합니다. 서버 검사는 실제 saveDailyLog를 실행하되 Supabase 응답을 메모리에서 모의합니다. 운영 DB end-to-end 검증은 아닙니다.
20. SUPABASE ACTION: RUN TARGETED MIGRATION. 실제 원격 테이블을 읽기 전용 요청으로 확인했습니다. 기존 homework_status는 HTTP 200, 새 컬럼 조회는 HTTP 400 / PostgreSQL 42703 / column does not exist였습니다. limit=0으로 학생 데이터를 가져오지 않았습니다.
21. 정확한 SQL은 아래와 같습니다. 새 컬럼은 BOOLEAN, nullable YES, default NULL입니다. 기존 RLS/ownership을 재사용합니다.
22. TypeScript, ESLint, production build와 기존 Phase 3/4 및 Mixed Progress 브라우저 회귀 검사를 통과했습니다. 물리 iPad Safari, 설치형 PWA, 실제 한글 IME 입력은 수동 확인이 필요합니다.
23. 모든 검증 통과 후 `Add online review status to student evaluations`로 커밋합니다. 해시는 최종 응답에 기재합니다.
24. Push는 실행하지 않았습니다. 직접 실행할 명령은 `git push origin master`입니다. 이 명령은 같은 브랜치의 앞선 미전송 커밋도 함께 전송합니다.

## Supabase 적용

SUPABASE ACTION: RUN TARGETED MIGRATION

실제 테이블: `public.student_lesson_logs`  
필드: `online_review_completed`  
타입: `BOOLEAN`  
nullable: `YES`  
default: `NULL`  
기존 컬럼 확인: 원격 조회에서 없음(42703), 로컬 migration에도 없음  
원격 실행 여부: 실행하지 않음

Supabase SQL Editor에서 아래 SQL만 적용합니다. 전체 migration 재실행은 필요 없습니다.

```sql
ALTER TABLE public.student_lesson_logs
  ADD COLUMN IF NOT EXISTS online_review_completed BOOLEAN NULL DEFAULT NULL;
```

파일: `supabase/migrations/20260914_add_online_review_completed.sql`

## 변경 파일

- `components/daily-log-form.tsx`: 상태, 초기값, 토글 UI, 최종 payload
- `lib/validation/daily-log.ts`: optional nullable boolean
- `lib/supabase/types.ts`: nullable DB 컬럼 타입
- `lib/supabase/queries/daily-logs.ts`: 기존 batch 저장 및 schema mismatch 안내
- `app/daily-logs/[id]/edit/page.tsx`: 수정 값 복원
- `components/lesson-log-detail.tsx`: 일지 상세 표시
- `app/students/[id]/page.tsx`: 기존 학생 수업 이력 표시
- `supabase/migrations/20260914_add_online_review_completed.sql`: 단일 additive 컬럼
- `scripts/test-online-review.cjs`: 실제 저장 함수·상세 renderer 검증
- `scripts/test-online-review-browser.cjs`: 실제 폼 브라우저 검증
- `ONLINE_REVIEW_REPORT.md`: 결과 및 적용 안내

## 검증 명령과 범위

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
npm.cmd run build
node scripts/test-online-review.cjs
node scripts/test-online-review-browser.cjs
node scripts/test-phase3.cjs
node scripts/test-phase4.cjs
node scripts/test-manual-progress-browser.cjs
```

브라우저 하네스는 기존 임시 Playwright/esbuild 런타임과 Edge를 사용합니다. 앱 의존성은 추가하지 않았습니다. 신규 스크린샷: `%TEMP%\teacher-dabin-online-review\online-review-{width}.png`.

검사: 토글 3상태·해제·키보드, 다른 학생 독립, 숙제 양방향 독립, 60초 자동저장, Draft reload, 최종 nullable validation, 수정 재저장, A→B→A, 새 날짜, 구 Draft, 학생 순서 변경, 출결 전환, 기존 입력 DOM/값 보존, 5개 화면 폭, 20명 batch/query 수, 결석/구 기록 상세 null-safe.

기존 Mixed Progress 16개 브라우저 검사에는 composition guard 및 textarea DOM 보존도 포함됩니다. 이번 작업으로 물리 기기의 IME/PWA 동작을 검증했다고 간주하지 않습니다.
