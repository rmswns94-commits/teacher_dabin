# Mixed Next Lesson Plan UX 보정

## 완료 상태

| 항목 | 결과 |
| --- | --- |
| Scope | MIXED_NEXT_PLAN_UX_REFINEMENT |
| Exam OFF Changed | NO |
| Exam School Next Plans | AUTO |
| Regular Textbook Next Plans | MANUAL_ADD |
| Button | 교재 계획 추가 |
| Automatic Regular Plan Inputs | NONE — Mixed 신규 작성 기준 |
| Zero Regular Plans Allowed | YES |
| Multiple Textbooks | SUPPORTED |
| Exam Prep Books In Select | NO |
| Existing Draft | PRESERVED |
| Existing Finalized | PRESERVED |
| Draft Persistence | PASS |
| Autosave | PASS |
| Final Save | PASS — 실제 폼·validation, server action은 테스트 대체 |
| Legacy Raw Next Plan | PRESERVED |
| Group Switch Leak | NONE |
| Duplicate Textbook | PREVENTED |
| Stable Key | PASS |
| Korean IME | MANUAL REQUIRED — 합성 composition 이벤트/DOM 동일성 검사 PASS |
| Multiline | PRESERVED |
| Dashboard Compatibility | PASS — 기존 Phase 4 브리핑/상세/수업 종료 전환 검사 |
| Todo Side Effect | NONE — 기존 계획 저장 및 Todo 정책 유지 |
| N+1 | NONE |
| PWA | MANUAL REQUIRED |
| iPad Landscape | MANUAL REQUIRED — 1024px Edge 레이아웃 PASS |
| iPad Portrait | MANUAL REQUIRED — 768px Edge 레이아웃 PASS |
| Split View | MANUAL REQUIRED — 507px Edge 레이아웃 PASS |
| Mobile | PASS — 390px Edge 레이아웃 |
| Supabase Action | NONE |
| TypeScript | PASS |
| Lint | PASS |
| Tests | PASS |
| Build | PASS |
| Commit Hash | 최종 응답에 기재. `git log -1 --format=%H -- MIXED_NEXT_PLAN_UX_REPORT.md`로 조회 가능 |

## 구현 설명

1. 기존 다음 수업 계획 편집기는 `components/daily-log-form.tsx`의 `DailyLogForm` 안에 있습니다.
2. 기존 Mixed 교재 계획은 Group의 모든 일반 교재 이름과 저장된 교재명을 합쳐 자동으로 textarea를 표시했습니다. 상태는 name→text map, 저장 형식은 `{name,text}[]`입니다.
3. Mixed에서 `manualTextbookPlans` 배열을 사용하도록 변경했습니다. 기존 진도의 `ManualTextbookProgress`에 `purpose="plan"`을 전달해 같은 추가·교재 선택·삭제 패턴을 재사용합니다. 기본 purpose는 progress로 유지됩니다.
4. 학교 계획은 기존 `examInputSchools` 및 `planSchoolNames`를 유지합니다. active target 학교는 자동 표시하고, 비대상/학생 0명 학교라도 저장된 내용은 보존합니다. 새 빈 stale target은 생성하지 않습니다.
5. `교재 계획 추가` 버튼은 `일반 수업 계획` 제목 바로 아래에 있습니다. 일반 학생이 없으면 신규 추가 버튼은 숨기되 저장된 항목은 표시합니다.
6. 옵션은 폼에 이미 로드된 Group `textbooks: string[]`입니다. 순서는 기존 목록 순서를 유지합니다.
7. exam-prep 교재 데이터를 참조하지 않습니다. 일반 교재 0개이면 등록 안내와 비활성 버튼을 표시합니다.
8. 기존 진도와 동일한 `ManualProgressItem {id,name,text}`를 사용합니다. 신규 항목은 추가 시 UUID를 만들고 Draft에 저장합니다. ID 없는 과거 배열은 hydrate 시 한 번 부여합니다. React key는 id입니다. 기존 저장 모델에는 별도 textbook ID가 없고 name이 교재 스냅샷입니다.
9. 다른 항목에서 선택한 교재는 disabled입니다. 기존 선택 helper도 중복/현재 목록 밖의 신규 선택을 막습니다. 과거 저장 항목을 임의로 정리하거나 삭제하지 않습니다.
10. 삭제는 해당 ID만 배열에서 제거합니다. 학교 계획, 다른 교재 계획, 오늘 진도에는 영향이 없습니다.
11. 기존 Draft `textbookPlans`를 수동 항목으로 복원합니다. 새 Draft의 `manualTextbookPlans`가 있으면 이를 우선 사용해 선택 전 입력과 삭제 후 빈 배열까지 정확히 복원합니다.
12. Finalized Edit는 기존 `initial.textbookPlans`를 복원합니다. 현재 Group에서 제거된 교재도 '(기존 기록)' 옵션으로 표시합니다. 현재 일반 학생 0명이어도 보존합니다.
13. Draft에는 수동 배열 전체의 id/name/text 및 배열 순서를 저장합니다. 기존 `textbookPlans`에는 이름과 내용이 있는 항목을 기존 형식으로 함께 저장합니다. 별도 sort_order 컬럼은 없으며 추가 순서를 유지합니다.
14. `manualTextbookPlans`를 기존 formStateRef 및 effect 의존성에 포함해 추가·선택 변경·내용 변경·삭제가 기존 60초 dirty autosave에 반영됩니다. 별도 저장 타이머는 없습니다.
15. Final Save는 기존 `textbookPlans`, `schoolPlans`, `nextLessonPlan` payload를 그대로 사용합니다. 교재+내용이 있는 항목만 structured 배열에 저장하고 기존처럼 최종 저장 때 바깥 공백을 trim합니다. 내부 줄바꿈은 유지합니다. 선택 전 빈 항목 및 교재만 선택한 빈 항목은 제외합니다. 선택 전 내용이 있으면 진도와 동일하게 교재 선택을 요청해 내용 유실을 방지합니다. 기존 계획 날짜 필수 조건도 유지합니다.
16. `next_lesson_plan` TEXT mirror와 기타 계획 메모를 유지합니다. legacy raw를 교재 항목으로 parsing하지 않습니다. Detail의 기존 structured 우선·raw fallback 정책도 유지합니다.
17. 그룹별 폼/Draft 경계를 재사용합니다. A→B에서는 새 빈 상태, A→B→A에서 저장된 ID와 내용이 중복 없이 복원되는 것을 확인했습니다.
18. onChange는 raw text를 저장합니다. typing 중 trim하지 않습니다. 항목 추가 및 교재 선택 변경에도 textarea DOM이 동일하고, 합성 composition 중 autosave를 중단하는 기존 guard가 동작합니다. 물리 iPad 한글 IME는 수동 확인 대상입니다.
19. Dashboard와 Detail은 같은 `school_plans`/`textbook_plans` 배열을 받습니다. resolver/source/class-end lock은 수정하지 않았습니다. 기존 지난 수업의 '다음 수업 계획 → 현재 공통 진도' 가져오기는 raw mirror를 전달하는 방식입니다. 새 교재 계획도 같은 mirror에 포함되므로 해당 경로로 전달되며, 새로운 structured import 기능은 추가하지 않았습니다.
20. 추가/삭제는 로컬 상태 변경입니다. Homework/Task mutation을 호출하지 않습니다. 서버의 기존 next-plan 저장은 새 Todo를 생성하지 않는 정책을 유지합니다. 과거부터 연결된 legacy Todo의 기존 동기화 정책도 변경하지 않았습니다.
21. 이미 로드된 교재 목록을 사용하므로 교재별 query나 mutation이 없습니다.
22. 기존 `daily_logs.textbook_plans`, `school_plans`와 Draft JSON으로 충분합니다. 새 DB 테이블/컬럼/migration/backfill은 없습니다.
23. 수정 파일: `components/daily-log-form.tsx`, `components/manual-textbook-progress.tsx`, `scripts/test-manual-plans-browser.cjs`, 이 보고서입니다.
24. 신규 브라우저 검사 13개가 통과했습니다. 시험 OFF/legacy/Mixed, 여러 항목/중복/삭제, 60초 autosave/reload, 기존 Draft/Finalized/제거된 교재, 그룹 전환, raw/빈 항목, IME guard/DOM, 5개 화면 폭을 검사했습니다.
25. SUPABASE ACTION: NONE. 이번 작업의 원격 DB 적용 단계는 없습니다.
26. TypeScript, ESLint, production build가 통과했습니다. Phase 3 14개, Phase 4 14개, Mixed Progress 브라우저 16개, 온라인 복습 브라우저 11개 회귀 검사도 통과했습니다.
27. 검증 후 `Allow adding textbook next plans in mixed exam mode`로 커밋합니다. 실제 해시는 최종 응답에 기재합니다.
28. Push하지 않았습니다. 직접 실행할 명령은 `git push origin master`입니다.

## 검증 명령

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
npm.cmd run build
node scripts/test-manual-plans-browser.cjs
node scripts/test-phase3.cjs
node scripts/test-phase4.cjs
node scripts/test-manual-progress-browser.cjs
node scripts/test-online-review-browser.cjs
```

브라우저 테스트는 실제 DailyLogForm과 validation을 사용하고 서버 action/navigation은 테스트 경계에서 대체합니다. 실제 Supabase에 학생 기록을 쓰는 운영 end-to-end 테스트는 아닙니다. 테스트는 기존 임시 Playwright/esbuild 런타임과 Edge를 사용하며 앱 의존성을 추가하지 않습니다.

신규 스크린샷: `%TEMP%\teacher-dabin-manual-plans\plan-{390,507,768,1024,1366}.png`. 390px 이미지를 확인했고 select/삭제/textarea 겹침이 없습니다. 물리 iPad Safari/PWA 및 실제 한국어 조합 입력은 수동 검증이 필요합니다.
