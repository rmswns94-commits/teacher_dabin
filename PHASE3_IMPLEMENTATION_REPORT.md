# Phase 3 — Mixed Homework / Next Plan / Tasks

기준 커밋: d90ca04 (Claude의 Phase 3 구현). 이번 보완은 과거 교재 계획 유실, 저장된 교재 표시, 현재 학생 후보 분리, 학교 미선택 후보 및 기존 지정 학생 표시를 수정한다.

## 검증 범위
TypeScript, ESLint, production build 및 실제 helper/저장 동기화 함수를 실행하는 14개 검증을 수행했다. 저장 검증은 메모리 DB 대역을 사용한다. 원격 Supabase, 로그인된 브라우저, 실기기는 검증하지 않았으므로 아래 PASS는 코드/자동 검증 범위다. 브라우저 테스트 A–AE 전체 통과를 의미하지 않는다.

## 요구사항 결과
| 항목 | 결과 |
| --- | --- |
| Phase | 3 — Mixed Homework / Next Plan / Tasks |
| Phase 1 Dependency | PASS — class_groups.exam_target_schools, nullable text[] |
| Phase 2 Dependency | PASS — resolveProgressMode / classifyStudentsByExamTarget |
| Exam OFF Homework | TEXTBOOK |
| Exam ON Configured Homework | MIXED |
| Exam Homework Context | TARGET_SCHOOL |
| Regular Homework Context | REGULAR_TEXTBOOK |
| Exam Homework Student Options | SELECTED_SCHOOL_STUDENTS_ONLY |
| Regular Homework Student Options | NON_EXAM_STUDENTS_ONLY |
| Homework Default Student | 공통 — nullable assigned_student_id |
| Homework Completion Preserved | YES — 자동 검증 |
| Homework Stored As Todo | NO — 구조화 숙제 |
| Today Todo Homework | PASS — 저장 context formatter / projection 코드 확인 |
| Dashboard Main Todo Changed | NO |
| Mixed Next Plan | PASS — 학교와 교재 저장, 삭제된 교재 계획도 보존 |
| Exam Next Plan | TARGET_SCHOOL |
| Regular Next Plan | REGULAR_TEXTBOOK |
| Mixed Tasks | PASS — 동기화 자동 검증 |
| Exam Task Context | TARGET_SCHOOL |
| Regular Task Context | REGULAR_TEXTBOOK |
| Task Draft Todo Side Effect | NONE — 완료 상태 가드/별도 autosave 경로 |
| Task Final Todo Sync | PASS — 자동 검증 |
| Duplicate Linked Todo | NONE — 재저장 자동 검증 |
| Legacy Exam Mode | PRESERVED |
| Existing Draft Converted | NO |
| Existing Draft Data Deleted | NO — 다음 계획의 저장된 교재 map 보존 보완 |
| Finalized History Rewritten | NO |
| Previous Homework Resolver Changed | NO |
| Class-end Lock | PRESERVED — 코드 변경 없음 |
| Group Switch Leak | MANUAL REQUIRED — group/date draft identity 코드 유지 |
| Exam Prep Textbook Policy | PRESERVED — regular textbook source 유지 |
| N+1 | NONE — 추가 DB 조회 없음, batch sync 자동 검증 |
| Korean IME | MANUAL REQUIRED |
| Form Remount | 새 remount 경로 추가 없음 — 실입력 검증 필요 |
| PWA | MANUAL REQUIRED |
| iPad Landscape / Portrait / Split View | MANUAL REQUIRED |
| Mobile 390px | MANUAL REQUIRED |
| Dashboard Mixed Redesign | OUT_OF_SCOPE_PHASE_4 |
| Excel Mixed Redesign | OUT_OF_SCOPE_PHASE_4 |
| Weekly View / Other Features | NOT IMPLEMENTED |
| Supabase Action | NONE |
| TypeScript | PASS |
| Lint | PASS |
| Tests | PASS — 14 checks, DB 대역 |
| Build | PASS |
| Commit Hash | See git log -1 --format=%h; commit and push authorized by user on 2026-09-14. |

## 구현 근거와 저장 호환성
1. Phase 1 저장은 class_groups.exam_target_schools이며 null은 legacy다. OFF가 우선이고 설정 배열이 있으면 mixed다.
2. 학생 분류는 기존 canonical helper의 trim 정확 일치를 재사용한다. 학교 미등록은 일반 학생이다.
3. 숙제는 daily_log_homework_assignments의 id, school, textbook, assigned_student_id, due_date, completed, completed_at을 사용한다. 한 숙제 row는 공통/개별 의미를 유지하고 학생 수만큼 복제하지 않는다.
4. 시험 숙제는 active target school, 일반 숙제는 regular textbook 입력이다. 선택 학교가 없으면 다른 학교 학생을 후보로 노출하지 않는다. 학교 변경은 기존 audienceForSchool로 유효하지 않은 학생을 공통으로 재설정한다.
5. 수정 화면은 현재 멤버와 과거 수업 명단을 구분한다. 과거 학생은 기존 숙제 대상에 보존하고 새 선택 후보는 현재 멤버를 쓴다. relation으로 받은 기존 학생 이름도 보존 표시한다.
6. 숙제 완료는 기존 row id별 상태를 유지한다. Today Todo/Detail/Previous Homework는 기존 formatHomeworkDisplay, buildHomeworkMirror 계열 formatter를 재사용한다. 완료된 지난 숙제 조회 정책은 변경하지 않았다.
7. 다음 계획은 daily_logs.textbook_plans / school_plans와 next_lesson_plan mirror를 사용한다. legacy raw fallback을 유지한다. 현재 교재 목록에서 빠진 이름도 저장 map에서 읽어 Draft/Final/UI에 보존한다.
8. 해야 할 일은 daily_logs.tasks JSONB에 stable id와 학교/교재 context를 저장한다. 완료 저장에서만 preparation_items에 task-{logId}-{taskId}로 동기화한다. 중복·완료 보존·수동 Todo 불변을 자동 검증했다.
9. Draft는 별도 payload로 저장하며 기존 section 및 학교/교재 필드를 유지한다. 서버 저장 시 기존 structured schema를 사용한다. 전체 migration/DB 수정은 실행하지 않았다.
10. 그룹 전환은 기존 group/date identity 및 페이지 경계를 유지한다. 기존 stable key 방식과 textarea를 유지하며 Phase 2 진도, 출결, 시험 캘린더, 보충, Dashboard/Excel 설계는 변경하지 않았다.
11. 자동 검증 실행: node scripts/test-phase3.cjs. Typecheck: node node_modules/typescript/bin/tsc --noEmit --incremental false. Lint: npm.cmd run lint. Build: npm.cmd run build.
12. 남은 실검증: 로그인 후 mixed 작성→임시저장→새로고침→완료→수정, 학교 변경 reset, A→B→A 복원, 오늘 할 일 완료 반영, 390px/iPad 화면 및 한글 조합/PWA. 실제 DB 저장과 브라우저 동작은 자동 테스트 대역만으로 보증할 수 없다.

## Push
User explicitly authorized committing and pushing the current work on 2026-09-14. Browser and device checks remain pending. Push command:

```sh
git push
```

Phase 4는 진행하지 않는다.
