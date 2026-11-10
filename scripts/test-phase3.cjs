/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads transpiled project modules without adding a runtime dependency. */
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict"), ts = require("typescript");
const cache = new Map();
function load(file) {
    file = path.resolve(file);
    if (cache.has(file))
        return cache.get(file).exports;
    let src = fs.readFileSync(file, "utf8");
    if (file.endsWith("queries" + path.sep + "daily-logs.ts"))
        src += "\nexport { syncDailyLogTaskTodos, syncHomeworkAssignments };";
    const m = { exports: {} };
    cache.set(file, m);
    function req(id) { if (id === "@/lib/supabase/server")
        return {}; if (id.startsWith("@/"))
        return load(id.slice(2) + ".ts"); return require(id); }
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInThisContext("(function(require,module,exports){" + js + "\n})", { filename: file })(req, m, m.exports);
    return m.exports;
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }
const mode = load("lib/progress-mode.ts"), hw = load("lib/homework-assignments.ts"), task = load("lib/daily-log-tasks.ts"), scope = load("lib/school-scope.ts"), imp = load("lib/lesson-import.ts");
// legacy target(grade null) = 학교 전체 — 기존 school-only 동작이 그대로 유지되는지
const all = (...schools) => schools.map((school) => ({ school, grade: null }));
const students = [{ id: "a", school: " Alpha ", grade: "middle_1" }, { id: "b", school: "Beta", grade: "middle_2" }, { id: "c", school: "Gamma", grade: "middle_1" }, { id: "d", school: null, grade: "middle_1" }];
check("OFF ignores retained targets", () => assert.equal(mode.resolveProgressMode(false, all("Alpha")), "regular"));
check("configured / empty / legacy mode", () => { assert.equal(mode.resolveProgressMode(true, []), "mixed"); assert.equal(mode.resolveProgressMode(true, all("Alpha")), "mixed"); assert.equal(mode.resolveProgressMode(true, null), "legacy_exam"); });
check("exact school matching and unregistered regular students", () => { const c = mode.classifyStudentsByExamTarget(students, all("Alpha", "Beta")); assert.deepEqual(c.examStudents.map(s => s.id), ["a", "b"]); assert.deepEqual(c.regularStudents.map(s => s.id), ["c", "d"]); assert.equal(mode.isExamTargetStudent({ school: "Alphabet", grade: "middle_1" }, all("Alpha")), false); });
check("active scopes omit stale target", () => assert.deepEqual(mode.activeTargetScopes(all("Alpha", "Missing"), students), [{ school: "Alpha", grade: "middle_1" }]));
check("selected scope student options", () => assert.deepEqual(mode.studentsOfScope(students, { school: "Alpha", grade: null }).map(s => s.id), ["a"]));

// ── SCHOOL + GRADE SCOPE ──
const gasan = [{ id: "kim", name: "김민지", school: "가산중학교", grade: "middle_1" }, { id: "park", name: "박서연", school: "가산중학교", grade: "middle_1" }, { id: "lee", name: "이준호", school: "가산중학교", grade: "middle_2" }, { id: "choi", name: "최수빈", school: "가산중학교", grade: "middle_3" }, { id: "kang", name: "강민호", school: "동산중학교", grade: "middle_2" }];
const g1 = { school: "가산중학교", grade: "middle_1" }, g2 = { school: "가산중학교", grade: "middle_2" }, d2 = { school: "동산중학교", grade: "middle_2" };
check("same school different grades become separate scopes", () => { const s = scope.uniqueSchoolGradeScopes(gasan); assert.deepEqual(s.map(scope.formatExamTarget), ["가산중학교 · 중1", "가산중학교 · 중2", "가산중학교 · 중3", "동산중학교 · 중2"]); });
check("grade-scoped filtering never leaks other grades", () => { assert.deepEqual(mode.studentsOfScope(gasan, g1).map(s => s.id), ["kim", "park"]); assert.deepEqual(mode.studentsOfScope(gasan, g2).map(s => s.id), ["lee"]); assert.deepEqual(mode.studentsOfScope(gasan, d2).map(s => s.id), ["kang"]); });
check("mixed target 가산중1 keeps 가산중2 regular", () => { const c = mode.classifyStudentsByExamTarget(gasan, [g1]); assert.deepEqual(c.examStudents.map(s => s.id), ["kim", "park"]); assert.ok(c.regularStudents.some(s => s.id === "lee")); });
check("multiple grades of same school as simultaneous targets", () => assert.deepEqual(mode.classifyStudentsByExamTarget(gasan, [g1, g2]).examStudents.map(s => s.id), ["kim", "park", "lee"]));
check("legacy school-only target covers every grade (no guessing)", () => assert.equal(mode.classifyStudentsByExamTarget(gasan, all("가산중학교")).examStudents.length, 4));
check("legacy school-wide target shows current students' grades as input scopes", () => {
  assert.deepEqual(mode.activeTargetScopes(all("가산중학교"), gasan.slice(0, 2)).map(scope.formatExamTarget), ["가산중학교 · 중1"]);
  assert.deepEqual(mode.activeTargetScopes(all("가산중학교"), gasan).map(scope.formatExamTarget), ["가산중학교 · 중1", "가산중학교 · 중2", "가산중학교 · 중3"]);
  assert.deepEqual(mode.activeTargetScopes([...all("가산중학교"), g1, d2], gasan).map(scope.examTargetToken), [g1, g2, { school: "가산중학교", grade: "middle_3" }, d2].map(scope.examTargetToken));
  assert.deepEqual(mode.activeTargetScopes([g2], gasan.slice(0, 2)), []);
});
check("normalize prefers exam_targets and reads legacy column as school-wide", () => { assert.deepEqual(scope.normalizeExamTargets({ exam_targets: [g2, g1, g1], exam_target_schools: ["가산중학교"] }), [g1, g2]); assert.deepEqual(scope.normalizeExamTargets({ exam_target_schools: ["가산중학교"] }), all("가산중학교")); assert.equal(scope.normalizeExamTargets({ exam_target_schools: null }), null); });
check("scope token round trip keeps school and grade separate", () => { const t = scope.scopeToken("가산중학교", "middle_2"); assert.deepEqual(scope.parseScopeToken(t), g2); assert.deepEqual(scope.parseScopeToken(scope.scopeToken("가산중학교", null)), all("가산중학교")[0]); });
check("progress applies only to own grade section, legacy section as fallback", () => {
  const sections = [{ name: "가산중학교", grade: "middle_1", text: "Lesson 3" }, { name: "가산중학교", grade: "middle_2", text: "Lesson 5" }];
  assert.equal(mode.sectionForStudent(sections, gasan[0]).text, "Lesson 3");
  assert.equal(mode.sectionForStudent(sections, gasan[2]).text, "Lesson 5");
  assert.equal(mode.sectionForStudent(sections, gasan[3]), null);
  assert.equal(mode.sectionForStudent([{ name: "가산중학교", text: "old" }], gasan[3]).text, "old");
  const applied = mode.scopedMissedProgressCandidate({ student: gasan[2], targets: [g1, g2], schoolSections: sections, textbookSections: [], extraMemo: "" });
  assert.ok(applied.includes("Lesson 5") && !applied.includes("Lesson 3"));
});
check("import: grade plan only into its own scope, legacy plan stays school-wide", () => {
  const tokens = [scope.examTargetToken(g1), scope.examTargetToken(g2)];
  const plans = [{ id: "p1", sourceLogId: "l", sourceLessonDate: "2026-11-01", targetDate: null, kind: "school", name: "가산중학교", grade: "middle_3", text: "x" }, { id: "p2", sourceLogId: "l", sourceLessonDate: "2026-11-01", targetDate: null, kind: "school", name: "가산중학교", grade: null, text: "y" }, { id: "p3", sourceLogId: "l", sourceLessonDate: "2026-11-01", targetDate: null, kind: "school", name: "가산중학교", grade: "middle_2", text: "z" }];
  const r = imp.classifyPlanImports({ mode: "mixed", plans, activeTargetTokens: tokens, memberScopeTokens: tokens, regularTextbooks: [], canAddRegular: false, currentSchoolText: {}, currentTextbookText: {}, currentMemo: "" });
  assert.deepEqual(r.map(p => p.status), ["incompatible", "importable", "importable"]);
  // 학교 전체(legacy) target 반 — 펼친 학년 scope로 학년 계획도, 학년 미지정 계획도 가져올 수 있다
  const expanded = mode.activeTargetScopes(all("가산중학교"), gasan.slice(0, 2)).map(scope.examTargetToken);
  const legacyRows = [{ ...plans[1] }, { ...plans[0], id: "p4", grade: "middle_1" }];
  const r2 = imp.classifyPlanImports({ mode: "mixed", plans: legacyRows, activeTargetTokens: expanded, memberScopeTokens: expanded, regularTextbooks: [], canAddRegular: false, currentSchoolText: {}, currentTextbookText: {}, currentMemo: "" });
  assert.deepEqual(r2.map(p => p.status), ["importable", "importable"]);
});
check("saved non-target school remains exam context", () => assert.equal(mode.mixedItemSection({ school: "Gamma" }, new Set(["c"])), "exam"));
check("saved textbook and draft section preserved", () => { assert.equal(mode.mixedItemSection({ textbook: "Grammar" }, new Set()), "regular"); assert.equal(mode.mixedItemSection({ section: "regular" }, new Set()), "regular"); });
check("mixed homework formatter and multiline mirror round trip", () => { const items = [{ school: "Alpha", content: "line1\nline2", dueDate: "2026-09-16" }, { textbook: "Grammar", content: "p42", dueDate: "2026-09-16", assignedStudentName: "Student" }]; const mirror = hw.buildHomeworkMirror(items); assert.ok(mirror.includes("Alpha")); assert.ok(mirror.includes("Grammar")); assert.ok(mirror.includes("line1\nline2")); assert.ok(hw.isDerivedHomeworkMirror(mirror, items)); });
check("task identity and due date retain existing policy", () => { assert.equal(task.dailyLogTaskTodoId("log", "a"), "task-log-a"); assert.equal(task.resolveDailyLogTaskDueDate(null, "2026-09-30"), "2026-10-01"); assert.equal(task.isDailyLogTaskTodoId("manual", "log"), false); });
const queries = load("lib/supabase/queries/daily-logs.ts");
function db(initial) {
    const state = { prep: structuredClone(initial), hw: [], calls: 0 };
    return { state, from(table) { state.calls++; let op = "read", data; const filters = {}; const q = { select() { return q; }, limit() { return q; }, eq(k, v) { filters[k] = v; return q; }, in(k, v) { filters[k] = v; return q; }, maybeSingle() { return Promise.resolve({ data: { preparation_items: state.prep }, error: null }); }, update(v) { op = "update"; data = v; return q; }, upsert(v) { op = "upsert"; data = v; return q; }, delete() { op = "delete"; return q; }, then(resolve, reject) { if (op === "update")
                state.prep = data.preparation_items; if (op === "upsert")
                state.hw = data; if (op === "delete")
                state.hw = state.hw.filter(r => !filters.id.includes(r.id)); return Promise.resolve({ data: table === "daily_log_homework_assignments" ? state.hw : [], error: null }).then(resolve, reject); } }; return q; } };
}
(async () => {
    const tasks = [{ id: "a", school: "Alpha", content: "Print", dueDate: "2026-09-15" }, { id: "b", textbook: "Grammar", content: "Mark\nwork", dueDate: "2026-09-15" }];
    const d = db([{ id: "manual", text: "manual", completed: false }]);
    await queries.syncDailyLogTaskTodos(d, "u", "g", "log", "2026-09-14", tasks);
    check("mixed tasks create exactly two linked Todos", () => assert.equal(d.state.prep.length, 3));
    d.state.prep.find(x => x.id === "task-log-a").completed = true;
    await queries.syncDailyLogTaskTodos(d, "u", "g", "log", "2026-09-14", tasks);
    check("resave preserves completion and prevents duplicate Todos", () => { assert.equal(d.state.prep.length, 3); assert.equal(d.state.prep.find(x => x.id === "task-log-a").completed, true); });
    await queries.syncDailyLogTaskTodos(d, "u", "g", "log", "2026-09-14", [tasks[1]]);
    check("task deletion leaves manual Todo intact", () => assert.deepEqual(d.state.prep.map(x => x.id), ["manual", "task-log-b"]));
    const h = db([]);
    h.state.hw = [{ id: "a", completed: true, completed_at: "2026-09-15T00:00:00Z" }, { id: "b", completed: false, completed_at: null }];
    await queries.syncHomeworkAssignments(h, "u", "log", [{ id: "a", school: "Alpha", content: "exam", dueDate: "2026-09-16" }, { id: "b", textbook: "Grammar", content: "regular", dueDate: "2026-09-16" }]);
    check("mixed homework resave preserves independent completion and context", () => { assert.equal(h.state.hw[0].completed, true); assert.equal(h.state.hw[1].completed, false); assert.equal(h.state.hw[0].school, "Alpha"); assert.equal(h.state.hw[1].textbook, "Grammar"); assert.equal(h.state.prep.length, 0); });
    // grade 컬럼 probe 1 + 기존 read 1 + upsert 1 — 숙제 수와 무관한 고정 횟수
    check("batch operations do not query per item", () => { assert.equal(h.state.calls, 3); assert.ok(d.state.calls <= 6); });
    const gh = db([]);
    await queries.syncHomeworkAssignments(gh, "u", "log", [{ id: "x", school: "가산중학교", grade: "middle_1", content: "1학년", dueDate: "2026-11-12" }, { id: "y", school: "가산중학교", grade: "middle_2", content: "2학년", dueDate: "2026-11-12" }]);
    check("homework rows keep school and grade separately per scope", () => { assert.deepEqual(gh.state.hw.map(r => [r.school, r.grade]), [["가산중학교", "middle_1"], ["가산중학교", "middle_2"]]); });
    const gt = db([]);
    await queries.syncDailyLogTaskTodos(gt, "u", "g", "log", "2026-11-11", [{ id: "a", school: "가산중학교", grade: "middle_1", content: "범위 확인" }, { id: "b", school: "가산중학교", grade: "middle_2", content: "범위 확인" }]);
    check("task Todos keep grade scope (same school different grades)", () => assert.deepEqual(gt.state.prep.map(x => x.grade), ["middle_1", "middle_2"]));
    console.log(passed + " checks passed");
})().catch(e => { console.error(e); process.exitCode = 1; });
