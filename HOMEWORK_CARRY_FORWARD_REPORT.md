# Homework Carry-forward

## 결과

| 항목 | 결과 |
| --- | --- |
| Feature | Homework Carry-forward |
| Original Due Date Mutated | NO |
| Homework Converted To Todo | NO |
| Today Incomplete Predicate | DUE_DATE_LTE_TODAY |
| Today Completed Predicate | COMPLETED_AT_IS_TODAY |
| Past Selected Date | EXACT_DUE_DATE_ONLY |
| Future Selected Date | EXACT_DUE_DATE_ONLY |
| Completed Today Remains Visible | YES |
| Completed Previous Day Carries | NO |
| Undated Homework Carries | NO |
| Overdue Label | 숙제 · 9/12 마감 / 숙제 · 완료 · 9/12 마감 |
| Homework Completion Handler | REUSED |
| Dashboard Main Todo Changed | NO |
| Previous Homework Resolver Changed | NO |
| Class-end Lock Changed | NO |
| Daily Log Resave Preserves Completion | YES |
| Calendar Marker Semantics | 원래 due_date의 Todo+숙제 수, 완료 포함; 이월 날짜에 중복 집계 없음 |
| Count Semantics | 기존 Todo count 유지; 별도 숙제 완료/전체에 오늘 표시되는 이월·오늘 완료 포함 |
| KST Date Handling | PASS |
| N+1 | NONE |
| F5 Required | NO — 기존 action revalidate 및 브라우저 상태 전환 검사 |
| PWA | MANUAL REQUIRED |
| iPad | MANUAL REQUIRED — 768/1024px Edge 레이아웃 PASS |
| Mobile | PASS — 390px Edge |
| Supabase Action | NONE |
| TypeScript | PASS |
| Lint | PASS |
| Tests | PASS |
| Build | PASS |
| Commit Hash | 최종 응답에 기재. `git log -1 --format=%H -- HOMEWORK_CARRY_FORWARD_REPORT.md`로 조회 가능 |

## 구현 설명

1. 기존 Todo 이월은 `app/todos/page.tsx`의 `sections`에서 계산합니다. active preparation 중 미완료이며 날짜 없음 또는 dueDate<=today를 포함하고, `isCompletedToday`인 완료 항목을 당일 표시합니다. 이 로직은 변경하지 않았습니다.
2. 숙제 조회는 `lib/supabase/queries/daily-logs.ts`의 `getDueHomeworkForCurrentUser`입니다. 기존에는 표시 월 범위와 오늘/선택 날짜만 한 번에 읽었습니다. 오늘 선택일 때만 이월·오늘 완료 후보 OR 조건을 추가했습니다.
3. `shouldShowHomeworkOnSelectedDate`는 dated homework에 한해 오늘이면 `(미완료 && dueDate<=today) || (완료 && KST 완료일=today)`를 적용합니다. 오늘 due라도 이전 날 완료했고 오늘 완료가 아니라면 오늘 작업함에는 표시하지 않습니다.
4. 오늘 완료한 숙제는 completedAt 기준으로 유지합니다. 기존 마감일/sort_order 정렬을 유지해 완료 직후 다른 위치로 이동하거나 7개 미리보기 밖으로 사라지지 않습니다.
5. 다음 날에는 완료일이 today와 달라져 오늘 작업함에서 제외됩니다. 삭제/복제/날짜 UPDATE 없이 조회 시점의 projection만 바뀝니다.
6. 과거 날짜 선택은 `dueDate===selectedDate`만 표시하며 완료 여부는 관계없습니다. 다른 과거 날짜에 이월하지 않습니다.
7. 미래 날짜도 exact due_date preview입니다. 오늘의 overdue를 미래 날짜에 반복하지 않습니다.
8. carry-forward 경로는 SELECT와 메모리 grouping/filter뿐입니다. 기존 완료 mutation도 정확한 homework.id/user_id로 completed/completed_at 두 필드만 UPDATE합니다. due_date는 변경하지 않습니다.
9. 오늘 화면에서 dueDate<today인 숙제의 기존 보조 텍스트에 `9/12 마감`을 추가했습니다. 기존 soft 색과 글자 크기를 유지합니다. 과거/미래 상세에서는 이월 라벨을 추가하지 않습니다.
10. 공통/학생별 모두 같은 predicate입니다. 기존 audience formatter와 relation embed의 학생 이름을 유지합니다.
11. 학교/일반 교재 context는 저장된 school/textbook을 사용합니다. 현재 Group 시험 ON/OFF를 보고 재분류하지 않습니다.
12. `toggleHomeworkCompletionAction`과 `toggleHomeworkCompletion`을 그대로 사용합니다. 기존은 optimistic 방식이 아니라 server form action 성공 후 `/todos` revalidate 방식입니다. 실패하면 실제 상태가 그대로 남습니다. `HomeworkCompletionButton`의 useFormStatus로 요청 중 버튼을 비활성화해 같은 화면의 중복 제출을 막습니다. 별도 이월 completion handler나 강제 reload는 없습니다.
13. 기존 `syncHomeworkAssignments`가 ID별 completed/completed_at을 보존하는 정책을 유지합니다. Phase 3의 일지 재저장 회귀 검사가 통과했습니다. 사용자가 일지에서 명시적으로 변경한 due_date는 그대로 새 기준이 됩니다.
14. Dashboard Main Todo는 이 숙제 조회를 사용하지 않습니다. source/query/UI를 수정하지 않았습니다.
15. Previous Homework resolver 및 class-end lock을 수정하지 않았고 Phase 4 회귀 검사도 통과했습니다. 숙제 완료 때문에 이전 일지의 content history가 숨겨지지 않습니다.
16. Calendar marker는 원래 due_date의 Todo+숙제 수입니다. 과거 완료도 포함합니다. 이월된 숙제는 오늘 marker에 복제하지 않습니다. 테스트에서 due 9/12의 marker와 9/14 marker가 완료 후에도 그대로인 것을 확인했습니다.
17. 기존 Todo 미완료/완료 count 의미를 유지합니다. 별도 `숙제 완료/전체`는 오늘 projection을 사용하므로 이월 숙제와 오늘 완료한 숙제가 포함됩니다. 학생/Growth/통계 로직은 수정하지 않았습니다.
18. todayDateString의 Asia/Seoul 날짜와 Todo의 기존 isCompletedToday/kstDateOfTimestamp를 재사용합니다. 공용 완료 helper의 인자 타입만 필요한 두 필드로 좁혔으며 Todo 로직은 동일합니다. DB completed_at 필터는 `오늘 00:00+09:00 <= timestamp < 다음 날 00:00+09:00`입니다. 23:59/00:00 및 월말 경계를 검사했습니다.
19. 기존 월 범위 OR exact-date에 `(completed=false AND due_date<=today)` 및 `(completed=true AND completed_at in KST today)`를 추가합니다. due_date NULL은 query 단계에서 제외합니다. 모든 완료 과거 기록을 무제한 가져오지 않습니다. 과거/미래 선택에는 이월 후보를 추가하지 않습니다.
20. 숙제는 한 번의 relation query로 학생 이름과 원본 일지/group을 가져옵니다. 30개 숙제에서도 query 1회이며 날짜별/학생별 반복 조회가 없습니다. 동일 OR query라 조건이 겹쳐도 같은 행은 중복되지 않습니다. 기존 ownership 필터/RLS를 유지하고 보관된 그룹은 기존대로 제외합니다.
21. 변경 파일은 아래 목록입니다.
22. 신규 서버/순수 함수/페이지 검사 9개와 브라우저 검사 5개가 통과했습니다. 브라우저에서는 현재 페이지와 completion button을 실제 렌더링하고 DB·액션·navigation 경계는 대체합니다. pending/완료/취소/실패/다른 숙제 및 Todo 독립/달력 marker/날짜 전환/5개 폭을 검사했습니다. 운영 DB에 실제 완료 쓰기를 수행한 end-to-end 테스트는 아닙니다.
23. SUPABASE ACTION: NONE. 실제 Supabase `daily_log_homework_assignments`에 due_date/completed/completed_at이 존재하는 것을 limit=0 읽기 요청의 HTTP 200으로 확인했습니다. 새 PostgREST 시간 범위 predicate도 limit=0에서 HTTP 200입니다. 학생 데이터 조회나 원격 수정, migration 실행은 하지 않았습니다.
24. TypeScript, ESLint, production build 통과. 기존 Phase 3 14개, Phase 4 14개, 온라인 복습 서버 저장 검사 3개도 통과했습니다. 물리 iPad/PWA는 수동 확인이 필요합니다.
25. 검증 후 `Carry overdue homework into today tasks`로 커밋합니다. 실제 커밋 해시는 최종 응답에 기재합니다.
26. Push하지 않았습니다. 직접 실행할 명령은 `git push origin master`입니다.

## 변경 파일

- `app/todos/page.tsx`: 오늘 숙제 projection, 그룹별 grouping, 정렬, 원래 마감일 라벨 및 완료 버튼 연결
- `lib/homework-visibility.ts`: 날짜별 노출 predicate와 DB 오늘 후보 filter
- `lib/preparation.ts`: 기존 KST 완료 helper의 공용 인자 타입
- `lib/supabase/queries/daily-logs.ts`: 기존 숙제 batch SELECT 조건 확장
- `components/homework-completion-button.tsx`: 기존 form action의 pending 제출 방지
- `scripts/test-homework-carry.cjs`: predicate, KST, 실제 query/mutation/페이지 검사
- `scripts/test-homework-carry-browser.cjs`: 실제 페이지 브라우저 검사
- `HOMEWORK_CARRY_FORWARD_REPORT.md`: 검증 결과

## 검증 명령

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
npm.cmd run build
node scripts/test-homework-carry.cjs
node scripts/test-homework-carry-browser.cjs
node scripts/test-phase3.cjs
node scripts/test-phase4.cjs
node scripts/test-online-review.cjs
```

브라우저 하네스는 기존 임시 Playwright/esbuild 런타임과 Edge를 사용합니다. 앱 패키지는 추가하지 않았습니다. 스크린샷은 `%TEMP%\teacher-dabin-homework-carry\homework-{390,507,768,1024,1366}.png`입니다. 390px 이미지를 직접 확인했습니다.

자정을 넘겨 켜 둔 페이지의 갱신은 기존 TodayRefresher의 날짜 변경 감지/재검증을 유지합니다. 이번 브라우저 검사는 날짜 resolver 입력을 바꾸어 다음 날 표시를 확인했으며, 실제 PWA 장시간 실행 및 OS 복귀 동작은 수동 확인 대상입니다.
