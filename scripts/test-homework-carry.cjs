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
    if (id === "@/components/app-shell") return { AppShell: ({ children }) => children };
    if (id === "@/components/today-refresher") return { TodayRefresher: () => null };
    if (id === "@/components/todo-create-dialog") return { TodoCreateDialog: () => null };
    if (id === "@/components/todo-delete-button") return { TodoDeleteButton: () => null };
    if (id === "@/app/groups/actions") return { togglePreparationItemAction: async () => {} };
    if (id === "@/app/daily-logs/actions") return { toggleHomeworkCompletionAction: async () => {} };
    if (id === "@/lib/supabase/queries/groups") return { getCurrentUserGroups: async () => [{ id: "group", name: "A", archived: false, preparation_items: [] }] };
    if (id === "@/lib/supabase/queries/schedules") return { getCurrentUserSchedulesWithGroup: async () => [] };
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

const { shouldShowHomeworkOnSelectedDate: show, homeworkTodayFilter } = load("lib/homework-visibility");
const { getDueHomeworkForCurrentUser: queryHomework, toggleHomeworkCompletion } = load("lib/supabase/queries/daily-logs");
const TodayPage = load("app/todos/page").default;
const { todayDateString } = load("lib/dates");
const { addDaysStr } = load("lib/calendar");
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
function memoryDB(rows) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const q = {
      select(columns) { call.columns = columns; return q; },
      eq(key, value) { call.filters.push([key, value]); return q; },
      or(filter) { call.or = filter; return q; },
      not(key, op, value) { call.not = [key, op, value]; return q; },
      order() { return q; }, maybeSingle() { call.single = true; return q; },
      update(payload) { call.update = payload; return q; },
      then(resolve, reject) {
        let data = rows.filter(row => call.filters.every(([key, value]) => row[key] === value));
        if (call.not) data = data.filter(row => row.due_date !== null);
        if (call.update) data.forEach(row => Object.assign(row, call.update));
        return Promise.resolve({ data: call.single ? data[0] : data, error: null }).then(resolve, reject);
      },
    }; return q;
  } };
}
async function main() {
  const base = { dueDate: "2026-09-12", completed: false, completedAt: null };
  check("today due/overdue and undated rules", () => {
    assert.equal(show(base, "2026-09-14", "2026-09-14"), true);
    assert.equal(show({ ...base, dueDate: "2026-09-14" }, "2026-09-14", "2026-09-14"), true);
    assert.equal(show({ ...base, dueDate: "2026-09-15" }, "2026-09-14", "2026-09-14"), false);
    assert.equal(show({ ...base, dueDate: null }, "2026-09-14", "2026-09-14"), false);
  });
  check("completed today retained; yesterday and legacy completion hidden", () => {
    for (const [completedAt, expected] of [["2026-09-13T15:00:00Z", true], ["2026-09-14T14:59:59Z", true], ["2026-09-13T14:59:59Z", false], [null, false]]) {
      assert.equal(show({ ...base, completed: true, completedAt }, "2026-09-14", "2026-09-14"), expected);
    }
    assert.equal(show({ ...base, completed: true, completedAt: "2026-09-14T14:59:00Z" }, "2026-09-15", "2026-09-15"), false);
  });
  check("past/future exact due only, regardless completion", () => {
    for (const completed of [false, true]) {
      assert.equal(show({ ...base, completed }, "2026-09-12", "2026-09-14"), true);
      assert.equal(show({ ...base, completed }, "2026-09-13", "2026-09-14"), false);
      assert.equal(show({ ...base, completed }, "2026-09-20", "2026-09-14"), false);
      assert.equal(show({ ...base, dueDate: "2026-09-20", completed }, "2026-09-20", "2026-09-14"), true);
    }
  });
  check("DB completion range uses half-open KST day including month boundary", () => {
    const filter = homeworkTodayFilter("2026-09-30");
    assert.ok(filter.includes("due_date.lte.2026-09-30"));
    assert.ok(filter.includes("completed_at.gte.2026-09-30T00:00:00+09:00"));
    assert.ok(filter.includes("completed_at.lt.2026-10-01T00:00:00+09:00"));
  });
  const today = todayDateString(), overdue = addDaysStr(today, -2), yesterday = addDaysStr(today, -1);
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `hw-${i}`, user_id: "owner", daily_log_id: "log", due_date: overdue,
    content: `내용${i}끝\n둘째 줄`, textbook: i % 2 ? null : "Grammar", school: i % 2 ? "한울중" : null,
    assigned_student_id: i % 2 ? "student" : null, assigned_student: i % 2 ? { id: "student", name: "김민지" } : null,
    completed: false, completed_at: null, sort_order: i, daily_logs: { id: "log", group_id: "group" },
  }));
  db = memoryDB(rows);
  const fetched = await queryHomework({ rangeStart: today, rangeEnd: today, extraDates: [today], carryForwardToday: today });
  check("30 homework use one ownership-filtered query with embedded audience/context", () => {
    assert.equal(db.calls.length, 1); assert.equal(fetched.length, 30);
    assert.deepEqual(db.calls[0].filters, [["user_id", "owner"]]);
    assert.deepEqual(db.calls[0].not, ["due_date", "is", null]);
    assert.ok(db.calls[0].or.includes(homeworkTodayFilter(today)));
    assert.equal(fetched[1].assignedStudentName, "김민지"); assert.equal(fetched[1].school, "한울중");
  });
  const dueBefore = rows[0].due_date;
  await toggleHomeworkCompletion("hw-0");
  check("existing exact homework toggle writes only completion fields and keeps due date", () => {
    assert.equal(rows[0].completed, true); assert.equal(rows[0].due_date, dueBefore); assert.equal(rows[1].completed, false);
    const write = db.calls.find(c => c.update);
    assert.deepEqual(Object.keys(write.update).sort(), ["completed", "completed_at"]);
    assert.deepEqual(write.filters, [["id", "hw-0"], ["user_id", "owner"]]);
    assert.ok(db.calls.every(c => c.table === "daily_log_homework_assignments"));
  });
  const html = renderToStaticMarkup(await TodayPage({ searchParams: Promise.resolve({ date: today }) }));
  check("real page retains checked overdue row, saved context, due label and separate count", () => {
    assert.ok(html.includes("내용0끝")); assert.ok(html.includes("aria-pressed=\"true\""));
    assert.ok(html.includes("마감")); assert.ok(html.includes("김민지")); assert.ok(html.includes("한울중"));
  });
  await toggleHomeworkCompletion("hw-0");
  check("restore clears completed_at without changing due date", () => {
    assert.equal(rows[0].completed, false); assert.equal(rows[0].completed_at, null); assert.equal(rows[0].due_date, dueBefore);
  });
  rows[0].completed = true; rows[0].completed_at = `${yesterday}T00:00:00+09:00`;
  const current = renderToStaticMarkup(await TodayPage({ searchParams: Promise.resolve({ date: today }) }));
  const historical = renderToStaticMarkup(await TodayPage({ searchParams: Promise.resolve({ date: overdue }) }));
  const otherPast = renderToStaticMarkup(await TodayPage({ searchParams: Promise.resolve({ date: yesterday }) }));
  check("real page hides previous completion today but preserves original due history only", () => {
    assert.ok(!current.includes("내용0끝")); assert.ok(historical.includes("내용0끝")); assert.ok(!otherPast.includes("내용1끝"));
    assert.ok(!db.calls.at(-1).or.includes("completed_at.gte"));
  });
  console.log(`${checks} homework carry-forward checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
