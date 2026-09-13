# Phase 4 — Mixed Downstream Display

Phase 1~3의 저장 구조를 유지하면서 브리핑·일지 상세·Excel에 저장된 학교/교재 context를 연결했다. 기준 커밋은 `175da4e`다. DB migration, 입력 모델 변경, 신규 기능 및 push는 수행하지 않는다.

## 검증 범위

자동 검증은 실제 TypeScript helper, 브리핑 조회 함수, React 컴포넌트, Excel route와 ExcelJS workbook을 실행한다. DB는 메모리 대역이며 원격 Supabase에 데이터를 쓰지 않는다. 브라우저는 실제 컴포넌트의 서버 렌더 결과와 production CSS를 headless Edge로 열어 검증했다. 로그인된 앱에서의 저장·라우팅·캐시 갱신, 물리 iPad와 설치형 PWA 테스트를 대신하지 않는다.

## 요구사항 결과

| 항목 | 결과 |
| --- | --- |
| Phase | 4 — Mixed Downstream Display |
| Phase 1 Dependency | PASS — exam flag / nullable exam_target_schools |
| Phase 2 Dependency | PASS — school_progress / textbook_progress 및 canonical 분류 |
| Phase 3 Dependency | PASS — mixed homework / plans / tasks, 기존 14개 검증 통과 |
| Briefing Layout | STACKED_FULL_WIDTH |
| Briefing Show More | NONE |
| Today Progress Source Changed | NO |
| Mixed Progress Display | PASS |
| Exam Progress Section | PASS |
| Regular Progress Section | PASS |
| Previous Homework Resolver Changed | NO |
| Previous Homework Mixed Display | PASS |
| Homework Completion Hides History | NO |
| Class-end Lock | PRESERVED — 종료 1ms 전/종료 시점 자동 검증 |
| Daily Log Detail Mixed Progress | PASS |
| Daily Log Detail Mixed Homework | PASS |
| Daily Log Detail Mixed Next Plan | PASS |
| Daily Log Detail Mixed Task | PASS |
| Today Todo Mixed Homework | PASS — 기존 formatter 및 완료 저장 테스트, 화면 코드 확인 |
| Dashboard Main Todo Changed | NO |
| Excel Textbook OFF | REGULAR_TEXTBOOKS |
| Excel Textbook ON With Exam Books | EXAM_PREP_BOOKS |
| Excel Textbook ON Without Exam Books | 시험대비 |
| Excel Mixed Progress | PASS — 실제 XLSX read-back |
| Excel Mutates Data | NO |
| Historical Context | PRESERVED |
| Legacy Raw Fallback | PRESERVED |
| N+1 Dashboard | NONE — 그룹당 기존 4쿼리, 이름/숙제는 relation embed |
| N+1 Excel | NONE — 일지+그룹 1쿼리, 시간표 batch 1쿼리 |
| F5 Required | MANUAL REQUIRED — 기존 revalidation 코드 유지, 로그인 앱 실검증 미수행 |
| Korean Multiline | PRESERVED — renderer 및 XLSX 자동 검증 |
| iPad Landscape | MANUAL REQUIRED — 해당 크기 Edge 검증 PASS, 실기기 미검증 |
| iPad Portrait | MANUAL REQUIRED — 해당 크기 Edge 검증 PASS, 실기기 미검증 |
| Split View | MANUAL REQUIRED — 507px Edge 검증 PASS, 실기기 미검증 |
| Mobile | PASS — 390px Edge, 가로 넘침 없음 |
| Dark Mode | PASS — 동일 5개 화면 폭에서 표시 확인 |
| Supabase Action | NONE |
| TypeScript | PASS |
| Lint | PASS |
| Tests | PASS — Phase 3 14개 + Phase 4 14개 + 브라우저 10개 조합 |
| Build | PASS |
| Commit Hash | 최종 응답의 커밋 해시 참조; 이 보고서도 동일 커밋에 포함 |

## 구현 상세

1. **Dashboard Briefing 실제 component:** `components/class-briefing.tsx`의 `ClassBriefing`. Card 외형, 제목, 상태, ‘오늘 체크할 것’은 유지하고 기존 `space-y-4` 세로 레이아웃을 그대로 사용한다.
2. **오늘 진도 실제 source:** `lib/supabase/queries/briefing.ts`의 `getGroupBriefingData`가 선택한 직전 completed 일지의 `next_lesson_plan`. 같은 row의 `school_plans`와 `textbook_plans`를 추가로 읽는다. 오늘 일지의 progress로 바꾸지 않았다.
3. **Class-end lock:** `lib/schedule.ts`의 `previousLessonSourceCutoff`와 `app/dashboard/page.tsx`에서 전달하는 `previousBefore`. 기존 `class_date < previousBefore`, 인증 사용자, 그룹, completed 조건과 정렬은 변경하지 않았다.
4. **Mixed Progress grouping:** `lib/mixed-display.ts`의 `savedSectionsForDisplay`와 `groupMixedContextsForDisplay`. 저장된 school/textbook 필드로만 분리한다. 항목 순서를 보존하고 내용 없는 반대편 섹션은 만들지 않는다.
5. **Previous Homework resolver:** 같은 `getGroupBriefingData`의 같은 lastLog다. 숙제 due_date나 최신 created_at만으로 다른 일지를 선택하지 않는다. due_date는 선택된 일지 내부 숙제의 표시 순서에만 사용한다.
6. **Mixed Homework grouping:** `daily_log_homework_assignments`를 선택된 일지에 relation embed하고, 학교→교재→context 없는 항목 순으로 구분한다. 원래 항목 객체를 수정하지 않는다.
7. **Audience:** 기존 `formatHomeworkDisplay` / `homeworkAudienceLabel`을 재사용한다. 개별 이름은 `assigned_student:students(name)` 관계에서 가져온다. 공통은 nullable 학생 의미 그대로다.
8. **완료 숙제 history:** completed 필터가 없다. 완료된 숙제도 지난 숙제에 보인다. 테스트는 완료된 항목을 포함한 12개를 실제 렌더 결과에서 각각 한 번씩 확인한다.
9. **준비할 일:** Dashboard의 기존 `activePreparationItems` 필터와 `formatTextbookLinked(linkedContextLabel(item), item.text)`를 그대로 유지한다. 이 source를 Main Todo나 Homework projection과 통합하지 않는다.
10. **Detail renderer:** `components/lesson-log-detail.tsx`의 `LessonLogDetail`. 캘린더 상세와 개별 상세가 같은 컴포넌트를 사용한다. 진도·숙제·다음 계획·할 일 모두 `components/mixed-context-display.tsx`의 공용 read-only 표시를 쓴다. 상세의 기존 7개 preview 정책은 유지하고 브리핑에는 적용하지 않는다.
11. **Legacy raw fallback:** 구조화 데이터가 없으면 원문을 그대로 표시한다. 구조화 데이터가 있으면 기존 deterministic mirror의 정확 일치/prefix만 제거하고 별도 메모는 보존한다. 학교명/학생명/교재명을 문자열에서 추론하지 않는다.
12. **Historical context:** 현재 Group 설정이나 Student.school로 재분류하지 않는다. Detail의 할 일은 저장된 `daily_logs.tasks` 내용/context를 사용하고 연결 Todo에서는 완료 상태만 읽는다. 연결 상태를 알 수 없으면 미완료로 추정하지 않는다. legacy는 기존 linked task/raw fallback을 유지한다.
13. **Today Todo:** 기존 school/textbook + audience formatter, due_date projection, 숙제 row 완료 체크를 유지한다. `app/todos/page.tsx`와 숙제 완료 mutation은 변경하지 않았다.
14. **Dashboard Main Todo:** `app/dashboard/page.tsx` 미변경. 숙제를 새 Todo로 넣거나 브리핑 표시 때문에 Todo를 생성하지 않는다.
15. **Excel exporter:** `app/daily-logs/export/route.ts` → `lib/excel/teacher-log-export.ts`의 `fillTeacherLogTemplate`.
16. **Excel 교재 cell resolver:** 기존 `examTextbookCell`을 코드 변경 없이 `lib/excel/teacher-log-display.ts`로 옮겨 독립 검증 가능하게 했다.
17. **Exam-prep textbook 조회:** 기존 `class_groups(..., exam_textbooks)` embed를 재사용한다. 교재마다 쿼리하지 않는다.
18. **‘시험대비’ 보장:** ON이고 유효한 시험 교재명이 없을 때 정확히 `시험대비`를 반환한다. helper와 실제 XLSX의 `E29`에서 검증한다.
19. **Excel Mixed Progress formatter:** `formatMixedProgressForExcel`이 저장된 학교/교재 진도를 `[시험 대비]`, `[일반 수업]`으로 구분한다. legacy raw는 그대로 반환한다.
20. **Excel multiline/wrap:** `\n`을 사용한다. 실제 workbook을 다시 열어 진도 anchor의 `alignment.wrapText === true`와 줄바꿈을 확인했다. template, 병합, 행/열, 비고, 인쇄 설정 변경 없음. 고정 양식의 기존 행 높이 제한은 그대로다.
21. **Current Group export semantics:** 교재 셀은 export 시점 Group flag와 교재 데이터로 결정한다. mixed 진도에 일반 교재가 있어도 ON의 교재 셀에 임의 추가하지 않는다.
22. **Saved Progress export semantics:** 진도 셀은 선택한 일지의 `school_progress` / `textbook_progress` / legacy 진도를 사용한다. 현재 Group flag는 진도를 재계산하지 않는다.
23. **Dashboard N+1:** 기존 마지막 일지 조회에 구조화 계획·숙제·대상 이름만 포함한다. context별 fetch/useEffect를 추가하지 않았다. 대역 테스트에서 기존 4회 조회를 확인했다.
24. **Excel N+1:** 7교시 실제 export route를 실행해 일지/그룹 1회 + 시간표 1회를 확인했다. mutation 메서드가 없는 DB 대역에서도 export가 성공한다.
25. **Freshness/revalidation:** 기존 `app/daily-logs/actions.ts`의 일지 상세·dashboard·todos revalidation을 유지한다. 새 cache, 강제 reload, 추가 router.refresh는 없다. class-end 전의 이전 자료 표시는 의도된 동작이다.
26. **Responsive:** 390/507/768/1024/1366px에서 light/dark 총 10조합. 제목 순서·세로 위치·동일 폭·가로 넘침 없음·숙제 12개 전체 표시·브리핑 버튼 없음 검증. 한글 multiline과 긴 텍스트를 사용했다. 물리 iPad/설치형 PWA는 미검증이다.
27. **수정 파일:** 아래 목록 참조.
28. **Browser Test:** fixture에 실제 서버 렌더 컴포넌트와 production CSS를 사용했다. Next 로그인 라우팅과 Supabase 실데이터 저장은 테스트하지 않았다. DB selector/종료 cutoff는 별도의 실제 함수+대역 검증이다.
29. **SUPABASE ACTION:** NONE. 새 table/column/migration 없음. 데이터 mutation 없음.
30. **검증 명령:** 아래 참조. TypeScript, ESLint, Phase 3/4 tests, production build, Edge 검사 통과.
31. **Commit:** 모든 자동 검증 통과 후 이 작업 파일만 커밋한다. 실제 해시는 최종 응답에 기록한다.
32. **Push:** 사용자 요청대로 실행하지 않는다. 사용자가 검토 후 `git push` 실행.

## 수정 파일 목록

- `components/class-briefing.tsx`
- `components/lesson-log-detail.tsx`
- `components/mixed-context-display.tsx` (신규)
- `lib/supabase/queries/briefing.ts`
- `lib/mixed-display.ts` (신규)
- `lib/excel/teacher-log-display.ts` (기존 helper 이동)
- `app/daily-logs/export/route.ts`
- `scripts/test-phase4.cjs` (신규)
- `scripts/test-phase4-browser.cjs` (신규, 선택적 Playwright 사용)
- `PHASE4_IMPLEMENTATION_REPORT.md`

## 검증 재실행

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm.cmd run lint
node scripts/test-phase3.cjs
node scripts/test-phase4.cjs
npm.cmd run build
```

선택적 브라우저 검증은 프로젝트 의존성을 추가하지 않고 TEMP의 Playwright와 설치된 Edge를 사용한다.

```powershell
npm.cmd install --prefix "$env:TEMP/teacher-dabin-phase4-browser" playwright --no-package-lock --ignore-scripts
$env:PHASE4_ARTIFACT_DIR = "$env:TEMP/teacher-dabin-phase4-artifacts"
node scripts/test-phase4.cjs
node scripts/test-phase4-browser.cjs
```

위 artifact 폴더에 실제 생성 XLSX, 렌더 HTML, 화면 폭별 light/dark 스크린샷이 저장된다. production build 후 실행해야 최신 CSS를 사용한다.

## 사용자 실행 명령

```sh
git push
```

Phase 5, 주간 일정, 학생 체크 브리핑, 검색, 통계 등 다른 기능은 시작하지 않는다.
