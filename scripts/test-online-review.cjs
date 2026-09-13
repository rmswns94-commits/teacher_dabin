/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS harness; no new application dependencies. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
let db;
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (!fs.existsSync(file)) file += fs.existsSync(`${file}.ts`) ? ".ts" : ".tsx";
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  function req(id) {
    if (id === "@/lib/supabase/server") return { createServerSupabaseClient: async () => db, getServerUser: async () => ({ id: "owner" }) };
    if (id === "@/components/daily-log-delete-button") return { DailyLogDeleteButton: () => null };
    if (id === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
    if (id.startsWith("@/")) return load(id.slice(2));
    if (id.startsWith(".")) return load(path.resolve(path.dirname(file), id));
    return require(id);
  }
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(req, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const { saveDailyLog } = load("lib/supabase/queries/daily-logs");
const { LessonLogDetail } = load("components/lesson-log-detail");
function mockDB(students) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, operation: "select" }; calls.push(call);
    const q = {
      select() { return q; }, eq() { return q; }, neq() { return q; }, in() { return q; },
      not() { return q; }, limit() { return q; }, order() { return q; },
      maybeSingle() { call.single = true; return q; }, single() { call.single = true; return q; },
      insert(payload) { call.operation = "insert"; call.payload = payload; return q; },
      update(payload) { call.operation = "update"; call.payload = payload; return q; },
      upsert(payload) { call.operation = "upsert"; call.payload = payload; return q; },
      delete() { call.operation = "delete"; return q; },
      then(resolve, reject) {
        let data = call.single ? null : [];
        if (table === "class_groups") data = { id: "group", is_exam_period: false, preparation_items: [] };
        if (table === "students") data = students.map(s => ({ id: s.studentId, name: s.studentId, school: null }));
        if (table === "daily_logs" && call.single) data = { id: "log" };
        if (table === "student_lesson_logs" && call.operation === "upsert") data = call.payload.map((row, i) => ({ ...row, id: `lesson-${i}` }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    }; return q;
  } };
}
async function main() {
  let baselineCount;
  for (const count of [3, 20]) {
    const students = Array.from({ length: count }, (_, i) => ({ studentId: `student-${i}`, attendance: "present",
      onlineReviewCompleted: [true, false, null][i % 3], homeworkStatus: i % 2 ? "completed" : "missing",
      focusLevel: "good", participationLevel: "active", questionLevel: "many", kindnessLevel: "good", effortLevel: "high",
      vocabCorrect: "7", memo: "existing memo", progress: "existing progress", parentNoteNeeded: false,
    }));
    db = mockDB(students);
    await saveDailyLog({ groupId: "group", classDate: "2026-09-14", status: "completed", students, tasks: [], homeworkAssignments: [] });
    const batch = db.calls.filter(c => c.table === "student_lesson_logs" && c.operation === "upsert");
    assert.equal(batch.length, 1); assert.equal(batch[0].payload.length, count);
    batch[0].payload.forEach((row, i) => {
      assert.equal(row.online_review_completed, students[i].onlineReviewCompleted);
      assert.equal(row.student_id, students[i].studentId); assert.equal(row.daily_log_id, "log");
      assert.equal(row.homework_status, students[i].homeworkStatus);
      assert.equal(row.focus_level, "good"); assert.equal(row.vocab_correct, 7);
      assert.equal(row.memo, "existing memo"); assert.equal(row.parent_note, null);
    });
    const writes = db.calls.filter(c => ["insert", "update", "upsert"].includes(c.operation));
    assert.deepEqual([...new Set(writes.map(c => c.table))].sort(), ["daily_logs", "student_lesson_logs"]);
    if (baselineCount) assert.equal(db.calls.length, baselineCount);
    baselineCount = db.calls.length;
    console.log(`PASS real saveDailyLog: ${count} students, one batch, preserved evaluations, no added side effects`);
  }
  for (const value of [true, false, null, undefined]) {
    const student = { studentId: "student", attendance: "absent", onlineReviewCompleted: value };
    db = mockDB([student]);
    await saveDailyLog({ dailyLogId: "log", groupId: "group", classDate: "2026-09-14", status: "completed", students: [student], tasks: [], homeworkAssignments: [] });
    const row = db.calls.find(c => c.table === "student_lesson_logs" && c.operation === "upsert").payload[0];
    assert.equal(row.online_review_completed, value ?? null);
    const detail = { id: "log", class_date: "2026-09-14", status: "completed", group: { name: "A" },
      lessonLogs: [{ ...row, id: "lesson", student: { name: "학생" }, vocab_correct: null }],
      makeups: [], praises: [], homeworkAssignments: [], tasks: [], linkedTasks: [],
    };
    const html = renderToStaticMarkup(React.createElement(LessonLogDetail, { detail, timeRange: null }));
    assert.equal(html.includes("온라인 복습"), typeof value === "boolean");
    if (typeof value === "boolean") assert.ok(html.includes(value ? "온라인 복습 완료" : "온라인 복습 미완료"));
  }
  console.log("PASS absent student edit saves and detail renders true/false/null/legacy undefined correctly");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
