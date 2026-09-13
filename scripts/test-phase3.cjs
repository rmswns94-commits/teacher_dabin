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
const mode = load("lib/progress-mode.ts"), hw = load("lib/homework-assignments.ts"), task = load("lib/daily-log-tasks.ts");
const students = [{ id: "a", school: " Alpha " }, { id: "b", school: "Beta" }, { id: "c", school: "Gamma" }, { id: "d", school: null }];
check("OFF ignores retained targets", () => assert.equal(mode.resolveProgressMode(false, ["Alpha"]), "regular"));
check("configured / empty / legacy mode", () => { assert.equal(mode.resolveProgressMode(true, []), "mixed"); assert.equal(mode.resolveProgressMode(true, ["Alpha"]), "mixed"); assert.equal(mode.resolveProgressMode(true, null), "legacy_exam"); });
check("exact school matching and unregistered regular students", () => { const c = mode.classifyStudentsByExamTarget(students, ["Alpha", "Beta"]); assert.deepEqual(c.examStudents.map(s => s.id), ["a", "b"]); assert.deepEqual(c.regularStudents.map(s => s.id), ["c", "d"]); assert.equal(mode.isExamTargetStudent("Alphabet", ["Alpha"]), false); });
check("active schools omit stale target", () => assert.deepEqual(mode.activeTargetSchools(["Alpha", "Missing"], ["Alpha", "Gamma"]), ["Alpha"]));
check("selected school student options", () => assert.deepEqual(mode.studentsOfSchool(students, "Alpha").map(s => s.id), ["a"]));
check("saved non-target school remains exam context", () => assert.equal(mode.mixedItemSection({ school: "Gamma" }, new Set(["c"])), "exam"));
check("saved textbook and draft section preserved", () => { assert.equal(mode.mixedItemSection({ textbook: "Grammar" }, new Set()), "regular"); assert.equal(mode.mixedItemSection({ section: "regular" }, new Set()), "regular"); });
check("mixed homework formatter and multiline mirror round trip", () => { const items = [{ school: "Alpha", content: "line1\nline2", dueDate: "2026-09-16" }, { textbook: "Grammar", content: "p42", dueDate: "2026-09-16", assignedStudentName: "Student" }]; const mirror = hw.buildHomeworkMirror(items); assert.ok(mirror.includes("Alpha")); assert.ok(mirror.includes("Grammar")); assert.ok(mirror.includes("line1\nline2")); assert.ok(hw.isDerivedHomeworkMirror(mirror, items)); });
check("task identity and due date retain existing policy", () => { assert.equal(task.dailyLogTaskTodoId("log", "a"), "task-log-a"); assert.equal(task.resolveDailyLogTaskDueDate(null, "2026-09-30"), "2026-10-01"); assert.equal(task.isDailyLogTaskTodoId("manual", "log"), false); });
const queries = load("lib/supabase/queries/daily-logs.ts");
function db(initial) {
    const state = { prep: structuredClone(initial), hw: [], calls: 0 };
    return { state, from(table) { state.calls++; let op = "read", data; const filters = {}; const q = { select() { return q; }, eq(k, v) { filters[k] = v; return q; }, in(k, v) { filters[k] = v; return q; }, maybeSingle() { return Promise.resolve({ data: { preparation_items: state.prep }, error: null }); }, update(v) { op = "update"; data = v; return q; }, upsert(v) { op = "upsert"; data = v; return q; }, delete() { op = "delete"; return q; }, then(resolve, reject) { if (op === "update")
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
    check("batch operations do not query per item", () => { assert.equal(h.state.calls, 2); assert.ok(d.state.calls <= 6); });
    console.log(passed + " checks passed");
})().catch(e => { console.error(e); process.exitCode = 1; });
