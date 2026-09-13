# Mixed Progress UX 보정

## Scope
MIXED_PROGRESS_UX_REFINEMENT

기준 커밋: `d9fa0c8`. 이미 적용된 Phase 4를 유지하며, 시험 ON + target configured인 Mixed Mode의 일반 교재 진도 입력만 수동 추가 방식으로 보정했다.

## 결과

| 항목 | 결과 |
| --- | --- |
| Exam OFF Progress Changed | NO |
| Exam School Progress | AUTO |
| Mixed Regular Textbook Progress | MANUAL_ADD |
| Button | 교재 진도 추가 |
| Regular Textbook Auto Inputs | NONE — 신규 Mixed 폼 기준 |
| Zero Textbook Progress Allowed | YES |
| Multiple Textbooks | SUPPORTED |
| Exam Prep Books In Select | NO |
| Existing Draft Progress | PRESERVED |
| Historical Progress | PRESERVED |
| Manual Progress Draft Persistence | PASS |
| Autosave | PASS — 실제 폼의 60초 타이머 + 저장 대역 |
| Final Save | PASS — 실제 폼 payload + 기존 Zod schema |
| Student Apply Scope | REGULAR_STUDENTS_ONLY — 일반 교재 진도 |
| Exam Apply Scope | MATCHING_SCHOOL_ONLY |
| Group Switch Leak | NONE — A→B→A 컴포넌트 전환 검증 |
| Duplicate Textbook Progress | PREVENTED — 신규 교재 선택 |
| Array Index Key | NONE — 추가 진도 행은 local UUID |
| Korean IME | MANUAL REQUIRED — 합성 composition 이벤트/DOM 동일성 PASS, 실제 한글 입력기 미검증 |
| Dashboard Compatibility | PASS — 기존 Phase 4 테스트 유지, source 변경 없음 |
| Excel Compatibility | PASS — 같은 structured payload와 기존 Excel formatter 검증 |
| Todo Side Effect | NONE — 새 mutation 없음 |
| Homework Side Effect | NONE — 새 mutation 없음 |
| N+1 | NONE — DB 쿼리 추가 없음 |
| Supabase Action | NONE |
| TypeScript | PASS |
| Lint | PASS |
| Tests | PASS — 기존 28개 + 폼 브라우저 검증 16개 |
| Build | PASS |
| Commit Hash | 최종 응답 참조 — 이 보고서도 동일 커밋에 포함 |

## 구현 상세

1. **기존 component:** `components/daily-log-form.tsx`의 `DailyLogForm`, `#progress` 영역.
2. **기존 자동 렌더:** Mixed에서 일반 학생이 있으면 `progressTextbookNames = textbooks`로 모든 등록 교재의 textarea를 렌더했다. state는 교재 이름→내용 map, 최종 저장은 `{ name, text }[]`였다. 기존 draft는 내용 있는 교재만 저장했다.
3. **수동 추가 방식:** Mixed에서만 `ManualTextbookProgress`를 렌더한다. 별도의 local item 배열이 선택 전/선택 후/빈 내용 상태를 유지한다. 신규 폼은 빈 배열로 시작한다.
4. **학교 자동 입력:** 기존 `activeTargetSchools`, `progressSchoolNames`, `schoolProgressField`를 유지한다. 기존 비대상 학교의 저장 내용도 보존한다. OFF 및 target null인 legacy 입력 분기는 그대로다.
5. **버튼 위치:** 일반 수업 진도 제목 아래에 기존 숙제 추가와 동일한 dashed border, Plus 아이콘, 최소 높이 44px 버튼을 배치했다.
6. **교재 options:** 현재 폼에 전달된 Group regular `textbooks`만 사용한다. 기존 순서를 유지한다.
7. **시험 교재 제외:** exam-prep 교재 데이터를 이 component에 전달하거나 합치지 않는다. 현재 목록에 없는 기존 항목의 자기 교재만 보존 option으로 표시한다.
8. **Stable identity:** `ManualProgressItem = { id, name, text }`. 추가 시 UUID를 발급하고 React key로 쓴다. 교재 변경·내용 변경·다른 행 추가 후에도 같은 textarea DOM을 유지한다. ID는 Draft에 보존하고 Final의 기존 `{ name, text }[]` 저장 형식은 변경하지 않는다.
9. **중복 처리:** 기존 이름 map 구조에 맞춰 동일 교재의 신규 중복 선택을 방지한다. 다른 행의 선택 교재 option은 disabled이고 `selectManualProgressTextbook`에서도 중복/유효하지 않은 신규 선택을 차단한다. 자기 선택값은 사라지지 않는다. 기존 데이터에 대한 migration/중복 정리는 수행하지 않는다.
10. **삭제:** local 배열에서 해당 UUID만 제거한다. 학교 map, 다른 교재, 학생별 기록, 숙제/할 일은 수정하지 않는다. 삭제는 기존 전체 저장 흐름에서 반영된다.
11. **기존 Draft:** 새 `manualTextbookProgress`가 없으면 기존 `textbookProgress`를 local item으로 hydrate한다. 내용/교재를 현재 목록으로 filter하지 않는다. 기존에 저장된 빈 context도 자동 정리하지 않는다.
12. **Finalized Edit:** `initial.textbookProgress`에서 동일하게 복원한다. 현재 교재 목록에서 빠진 이름과 현재 일반 학생 0명인 경우도 기존 항목을 표시한다. 일반 학생 0명이면 새 추가 버튼만 숨긴다.
13. **Autosave:** 기존 `formStateRef` snapshot에 Mixed일 때 `manualTextbookProgress`를 포함한다. stable ID·추가 순서·선택 전 내용·빈 항목까지 Draft에 보존한다. 기존 canonical `textbookProgress`도 함께 직렬화한다. 기존 60초 타이머와 composition/in-flight guard는 변경하지 않았다. 자동/수동 불러오기 모두 deserialize를 적용한다.
14. **Final Save:** `manualProgressSections`가 의미 있는 항목만 기존 `textbookProgress`에 넣는다. 최종 저장 시 가장자리만 trim하며 내부 줄바꿈을 유지한다. 완전히 빈 행 및 교재만 선택한 빈 내용은 기존 empty policy처럼 제외한다. 내용은 있으나 교재 미선택이면 안내 후 저장을 막아 내용이 조용히 유실되지 않도록 한다. Draft에는 이 내용이 보존된다.
15. **Regular apply:** 기존 `applyDefaultProgress`와 `scopedMissedProgressCandidate`를 그대로 사용한다. 일반 학생·학교 미등록 학생에게는 수동 추가한 일반 교재 진도만 전달된다. 별도 교재-학생 eligibility 관계를 만들지 않았다.
16. **School apply:** 같은 기존 helper로 시험 대상 학생에게 자기 학교 진도만 적용한다. 결석자의 놓친 진도 fallback도 기존 로직 그대로다.
17. **그룹 전환:** 기존 페이지/폼 identity와 key 경계를 유지한다. 전역 진도 state를 만들지 않았다. 브라우저 harness에서 A의 Draft를 저장하고 B를 빈 상태로 연 뒤 A를 복원해 ID와 내용이 돌아오는 것을 확인했다.
18. **IME:** textarea onChange는 raw 문자열을 저장한다. render 시 sort/trim/id 재발급을 하지 않는다. 실제 React 폼에서 compositionstart 동안 autosave가 멈추고 compositionend 후 다른 행 추가에도 textarea가 동일 DOM임을 확인했다. 물리 iPad의 한글 키보드 조합은 별도 확인 대상이다.
19. **Dashboard:** 코드 변경 없음. 브리핑의 오늘 진도 source는 여전히 직전 일지의 다음 계획이며, 이 입력 보정 때문에 현재 진도로 바꾸지 않았다. 기존 Phase 4 read/display 테스트를 재실행했다.
20. **Excel:** 코드/교재 셀 정책 변경 없음. Final payload의 수동 교재 진도가 기존 Mixed Excel formatter에 포함되는 것을 확인했다. OFF 일반 교재, ON 시험 교재, ON 교재 없음 `시험대비` 테스트도 기존대로 통과했다.
21. **DB schema:** 변경 없음. Draft의 기존 JSON payload에 편집 상태를 추가했으며 신규 table/column, backfill, migration은 없다.
22. **수정 파일:** `components/daily-log-form.tsx`, 신규 `components/manual-textbook-progress.tsx`, 신규 `lib/manual-progress.ts`, 신규 `scripts/test-manual-progress-browser.cjs`, 이 보고서.
23. **Browser Tests:** 실제 `DailyLogForm`을 React로 mount하고 headless Edge에서 조작했다. Next navigation·서버 actions만 테스트 대역이다. 서버 저장 payload는 실제 Zod schema로 검사한다. 테스트용 localStorage는 Draft reload를 모사할 뿐, 실제 앱의 저장소를 변경하지 않았다. 390/507/768/1024/1366px에서 교재 select·삭제 버튼 겹침과 행 overflow를 검사하고 스크린샷을 저장했다.
24. **SUPABASE ACTION:** NONE. 원격 DB에 쓰지 않았다. 실제 로그인·원격 저장·물리 iPad·설치형 PWA는 이번 자동 검증 범위가 아니다.
25. **TypeScript/Lint/Test/Build:** 전부 통과. 아래 재실행 명령 참조.
26. **Commit:** 자동 검증 통과 후 이 보정 파일만 커밋한다. 정확한 해시는 최종 응답에 기록한다.
27. **Push:** 요청대로 실행하지 않는다. 사용자가 검토 후 `git push` 실행.

## 검증 재실행

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm.cmd run lint
node scripts/test-phase3.cjs
node scripts/test-phase4.cjs
npm.cmd run build
```

브라우저 harness는 프로젝트 의존성을 추가하지 않고 TEMP의 Playwright/esbuild 및 설치된 Edge를 사용한다.

```powershell
npm.cmd install --prefix "$env:TEMP/teacher-dabin-phase4-browser" playwright esbuild --no-package-lock
node scripts/test-manual-progress-browser.cjs
```

스크린샷: `$env:TEMP/teacher-dabin-manual-progress/progress-390.png` 등. 최신 production CSS를 사용하려면 build 후 브라우저 검증을 실행한다.

## 사용자 실행 명령

```sh
git push
```

다른 신규 기능은 시작하지 않는다.
