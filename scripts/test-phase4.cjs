/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS harness; no new application dependencies. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ExcelJS = require("exceljs");
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

const display = load("lib/mixed-display");
const books = load("lib/textbooks");
const homework = load("lib/homework-assignments");
const { examTextbookCell } = load("lib/excel/teacher-log-display");
const { fillTeacherLogTemplate, TEACHER_LOG_TEMPLATE } = load("lib/excel/teacher-log-export");
const { previousLessonSourceCutoff } = load("lib/schedule");
const { getGroupBriefingData } = load("lib/supabase/queries/briefing");
const { ClassBriefing } = load("components/class-briefing");
const { LessonLogDetail } = load("components/lesson-log-detail");
const { SavedLessonSections } = load("components/mixed-context-display");
const { GET: exportRoute } = load("app/daily-logs/export/route");
let checks = 0;
function check(name, test) { test(); checks++; console.log(`PASS ${name}`); }
const school = [{ name: "한울중학교", text: "중간고사 5과\n문법 총정리" }, { name: "동탄중학교", text: "서술형 대비" }];
const textbook = [{ name: "Grammar Inside 2", text: "Unit 6 관계대명사" }];
const raw = [books.buildTextbookSectionsText(textbook), books.buildTextbookSectionsText(school)].join("\n\n");
const assignments = Array.from({ length: 12 }, (_, i) => ({
  id: `hw-${i}`, content: `숙제내용${i}끝\n${"긴내용".repeat(35)}`, due_date: "2026-09-16", sort_order: i,
  school: i < 6 ? "한울중학교" : null, textbook: i >= 6 ? "Grammar Inside 2" : null,
  assignedStudentName: i % 2 ? "김민지" : null,
  assigned_student: i % 2 ? { name: "김민지" } : null, completed: i === 0,
}));
const log = {
  id: "log", group_id: "group", user_id: "owner", class_date: "2026-09-13", status: "completed",
  next_lesson_plan: raw, school_plans: school, textbook_plans: textbook,
  homework: homework.buildHomeworkMirror(assignments.map((item) => ({ ...item, dueDate: item.due_date }))),
  daily_log_homework_assignments: assignments, student_lesson_logs: [], vocab_total: null,
};
function mockDB(logs = [log]) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [], order: [] }; calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(k, v) { call.filters.push([k, "eq", v]); return query; },
      lt(k, v) { call.filters.push([k, "lt", v]); return query; },
      lte() { return query; }, gte() { return query; }, in() { return query; },
      order(k) { call.order.push(k); return query; }, limit(n) { call.limit = n; return query; },
      maybeSingle() { call.single = true; return query; },
      then(resolve, reject) {
        let data = [];
        if (table === "student_group_memberships") data = [{ students: { id: "member", name: "현재학생", archived: false } }];
        if (table === "class_group_schedules") data = logs.map((item, i) => ({ group_id: item.group_id, start_time: `${14 + i}:00`, end_time: `${15 + i}:00` }));
        if (table === "daily_logs") {
          data = logs.filter((item) => call.filters.every(([k, op, v]) => op === "eq" ? item[k] === v : item[k] < v));
          if (call.order.length) data.sort((a, b) => b.class_date.localeCompare(a.class_date));
          if (call.limit) data = data.slice(0, call.limit);
          if (call.single) data = data[0] ?? null;
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

async function main() {
  check("saved grouping preserves both sides, unlinked items and input order", () => {
    const input = [{ id: 1, school: "A" }, { id: 2, textbook: "B중학교" }, { id: 3 }, { id: 4, school: "Z" }];
    const before = JSON.stringify(input);
    assert.deepEqual(display.groupMixedContextsForDisplay(input).map((g) => g.items.map((x) => x.id)), [[1, 4], [2], [3]]);
    assert.equal(JSON.stringify(input), before);
  });
  for (const [label, input, wanted, absent] of [
    ["school only", { school }, "시험 대비", "일반 수업"],
    ["textbook only", { textbook }, "일반 수업", "시험 대비"],
    ["legacy raw", { raw: "중학교라는 글자만 있는\n원문" }, "원문", "시험 대비"],
  ]) check(label, () => {
    const html = renderToStaticMarkup(React.createElement(SavedLessonSections, input));
    assert.ok(html.includes(wanted)); assert.ok(!html.includes(absent));
  });
  check("exact mirror removed, extra memo and multiline retained", () => {
    const result = display.savedSectionsForDisplay({ school, textbook, raw: `${raw}\n\n추가 메모` });
    assert.equal(result.extra, "추가 메모"); assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].text, school[0].text);
    assert.equal(display.savedSectionsForDisplay({ school, raw: "독립 메모" }).extra, "독립 메모");
  });
  check("Excel textbook OFF / ON with books / exact no-book fallback", () => {
    assert.equal(examTextbookCell({ textbook: "Grammar\nReading", is_exam_period: false, exam_textbooks: [{ name: "Exam" }] }), "Grammar\nReading");
    assert.equal(examTextbookCell({ textbook: "Grammar", is_exam_period: true, exam_textbooks: [{ name: "백발백중" }, { name: "이그잼포유" }] }), "백발백중\n이그잼포유");
    assert.equal(examTextbookCell({ textbook: "Grammar", is_exam_period: true, exam_textbooks: [] }), "시험대비");
  });
  check("Excel saved progress and legacy fallback", () => {
    const output = display.formatMixedProgressForExcel({ school, textbook, raw });
    assert.ok(output.includes("[시험 대비]")); assert.ok(output.includes("[일반 수업]"));
    assert.equal(output.split("문법 총정리").length, 2);
    assert.equal(display.formatMixedProgressForExcel({ raw: "원문\n  들여쓰기" }), "원문\n  들여쓰기");
  });
  const endEpoch = Date.parse("2026-09-14T18:30:00+09:00");
  const occurrence = { date: "2026-09-14", endEpoch };
  const todayLog = { ...log, id: "today", class_date: "2026-09-14" };
  db = mockDB([log, todayLog, { ...todayLog, id: "draft", status: "draft" }, { ...todayLog, id: "foreign", user_id: "another" }]);
  const before = await getGroupBriefingData("group", "2026-09-14", "2026-08-15", previousLessonSourceCutoff(occurrence, endEpoch - 1));
  check("class-end lock excludes early finalized log and draft", () => { assert.equal(before.lastLog.id, "log"); assert.equal(db.calls.length, 4); });
  check("previous homework keeps completed records and embedded student names", () => {
    assert.equal(before.lastLog.homeworkAssignments.length, 12);
    assert.equal(before.lastLog.homeworkAssignments[1].assignedStudentName, "김민지");
    const query = db.calls.find((x) => x.table === "daily_logs");
    assert.ok(query.columns.includes("assigned_student:students(name)"));
    assert.deepEqual(query.order, ["class_date", "created_at"]);
  });
  const after = await getGroupBriefingData("group", "2026-09-14", "2026-08-15", previousLessonSourceCutoff(occurrence, endEpoch));
  check("class-end handoff selects today's completed log", () => assert.equal(after.lastLog.id, "today"));
  db = mockDB();
  const briefingNode = await ClassBriefing({ group: { id: "group", name: "7교시", icon: null }, isNow: true, startTime: "17:00", today: "2026-09-14", previousBefore: "2026-09-14", exams: [], prepTexts: ["한울중학교 - 시험지 출력", "Grammar Inside 2 - 워크북 채점"] });
  const briefing = renderToStaticMarkup(briefingNode);
  check("briefing all 12 homework entries once, both audiences, no show-more", () => {
    for (let i = 0; i < 12; i++) assert.equal(briefing.split(`숙제내용${i}끝`).length, 2);
    for (const text of ["시험 대비", "일반 수업", "공통", "김민지", "Grammar Inside 2", "한울중학교"]) assert.ok(briefing.includes(text));
    assert.ok(!/전체 보기|더 보기|접기/.test(briefing));
    assert.ok(briefing.indexOf("준비할 일") < briefing.indexOf("오늘 진도"));
    assert.ok(briefing.indexOf("오늘 진도") < briefing.indexOf("지난 숙제"));
  });
  const detail = {
    ...log, default_progress: raw, lesson_content: null, school_progress: school, textbook_progress: textbook,
    group: { id: "group", name: "7교시", is_exam_period: false, exam_target_schools: ["새학교"] },
    lessonLogs: [], makeups: [], homeworkAssignments: assignments.slice(0, 2).concat(assignments.slice(6, 8)),
    tasks: [{ id: "a", school: "한울중학교", content: "과거 시험지 출력" }, { id: "b", textbook: "Grammar Inside 2", content: "과거 워크북 채점" }],
    linkedTasks: [{ id: "task-log-a", school: "새학교", text: "현재 Todo 수정됨", completed: true }],
  };
  detail.homework = homework.buildHomeworkMirror(detail.homeworkAssignments.map((item) => ({ ...item, dueDate: item.due_date })));
  const detailHtml = renderToStaticMarkup(React.createElement(LessonLogDetail, { detail, timeRange: null }));
  check("detail progress/homework/plan/task use saved contexts despite config and Todo changes", () => {
    assert.equal(detailHtml.split("시험 대비").length, 5);
    assert.equal(detailHtml.split("일반 수업").length, 5);
    assert.ok(detailHtml.includes("과거 시험지 출력")); assert.ok(detailHtml.includes("완료됨"));
    assert.ok(!detailHtml.includes("현재 Todo 수정됨")); assert.ok(!detailHtml.includes("새학교"));
    assert.equal(detailHtml.split("숙제내용0끝").length, 2);
  });
  const exportRows = Array.from({ length: 7 }, (_, i) => ({ ...log, id: `export-${i}`, group_id: `g-${i}`, default_progress: raw, lesson_content: null,
    school_progress: school, textbook_progress: textbook,
    class_groups: { name: `group ${i}`, textbook: "Grammar", is_exam_period: i !== 0, exam_textbooks: i === 1 ? [{ name: "백발백중" }] : [] },
  }));
  db = mockDB(exportRows);
  const response = await exportRoute(new Request("http://localhost/daily-logs/export?date=2026-09-13"));
  assert.equal(response.status, 200);
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(TEACHER_LOG_TEMPLATE.sheetName);
  check("7-period real XLSX route: batch queries, textbook policy, saved progress, wrap", () => {
    assert.equal(db.calls.length, 2);
    assert.equal(sheet.getCell("E13").value, "Grammar");
    assert.equal(sheet.getCell("E21").value, "백발백중");
    assert.equal(sheet.getCell("E29").value, "시험대비");
    for (const anchor of TEACHER_LOG_TEMPLATE.periods) {
      const cell = sheet.getCell(anchor.progressCell);
      assert.ok(cell.value.includes("[시험 대비]")); assert.ok(cell.value.includes("[일반 수업]"));
      assert.ok(cell.value.includes("5과\n문법")); assert.equal(cell.alignment.wrapText, true);
    }
    assert.equal(sheet.getCell("A11").value, "교시"); assert.equal(sheet.getCell("A71").value, "출근시간");
  });
  await assert.rejects(() => fillTeacherLogTemplate({ rows: Array(8).fill({}), dateLabel: "" }), /7/);
  check("8-period limit preserved", () => {});
  if (process.env.PHASE4_ARTIFACT_DIR) {
    const dir = process.env.PHASE4_ARTIFACT_DIR; fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "mixed-log.xlsx"), buffer);
    const cssDir = path.join(root, ".next/static/chunks");
    const css = fs.readdirSync(cssDir).filter((p) => p.endsWith(".css")).map((p) => fs.readFileSync(path.join(cssDir, p), "utf8")).join("\n");
    fs.writeFileSync(path.join(dir, "display.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="min-w-0 p-5"><div id="briefing">${briefing}</div><div id="detail" class="mt-5">${detailHtml}</div></main></body></html>`);
  }
  console.log(`${checks} Phase 4 checks passed`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
