/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS harness; no new application dependencies (jszip ships with exceljs). */
// 월간 Excel 내보내기 검증 — route를 mock DB로 실행해 실제 xlsx를 만들고 다시 읽어 확인한다.
// 인쇄 설정(페이지 나누기/인쇄 영역/용지)은 exceljs가 다시 읽지 못하는 항목이 있어 XML로 직접 확인.
// 기존 일 단위 export는 HEAD 코드가 만든 파일과 sheet XML을 비교해 회귀가 없음을 확인한다.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const ts = require("typescript");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const root = path.resolve(__dirname, "..");
const OWNER = "owner";
let db;
let tables = {};
const rangeCalls = [];
let scheduleFixtures = [];

const stubs = {
  "@/lib/supabase/server": () => ({ createServerSupabaseClient: async () => db, getServerUser: async () => ({ id: OWNER }) }),
  "@/lib/supabase/queries/schedule-exceptions": () => ({ getScheduleExceptionsInRange: async (s, e) => { rangeCalls.push(["exceptions", s, e]); return []; } }),
  "@/lib/supabase/queries/academy-closures": () => ({ getAcademyClosuresInRange: async (s, e) => { rangeCalls.push(["closures", s, e]); return []; } }),
  "@/lib/supabase/queries/supplements": () => ({ getSupplementsInRange: async (s, e) => { rangeCalls.push(["supplements", s, e]); return []; } }),
  "@/lib/korean-holidays": () => ({ getKoreanHolidaysInRange: async (s, e) => { rangeCalls.push(["holidays", s, e]); return new Map(); } }),
  "@/lib/supabase/queries/schedules": () => ({ getCurrentUserSchedulesWithGroup: async () => scheduleFixtures }),
};

const cache = new Map();
function compile(source, file, overrides = {}, loaded = { exports: {} }) {
  function req(id) {
    if (overrides[id]) return overrides[id];
    if (stubs[id]) return stubs[id]();
    if (id.startsWith("@/")) return load(id.slice(2));
    if (id.startsWith(".")) return load(path.resolve(path.dirname(file), id));
    return require(id);
  }
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(req, loaded, loaded.exports);
  return loaded.exports;
}
function load(file) {
  file = path.resolve(root, file);
  if (!fs.existsSync(file)) file += fs.existsSync(`${file}.ts`) ? ".ts" : ".tsx";
  if (cache.has(file)) return cache.get(file).exports;
  // 순환 import 대비 — 실행 전에 module 객체를 먼저 등록한다 (exports는 live로 채워짐)
  const loaded = { exports: {} };
  cache.set(file, loaded);
  compile(fs.readFileSync(file, "utf8"), file, {}, loaded);
  return loaded.exports;
}
// HEAD(변경 전) 버전 모듈 — 기존 일 단위 출력 회귀 비교용
function loadHead(relative, overrides) {
  const source = execSync(`git show HEAD:${relative}`, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return compile(source, path.resolve(root, relative), overrides);
}

function mockDb() {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      const described = [];
      let columns = "";
      const q = {
        select(c) { columns = c; return q; },
        eq(k, v) { filters.push((r) => r[k] === v); described.push(`eq:${k}=${v}`); return q; },
        in(k, vs) { filters.push((r) => vs.includes(r[k])); described.push(`in:${k}`); return q; },
        gte(k, v) { filters.push((r) => r[k] != null && r[k] >= v); described.push(`gte:${k}=${v}`); return q; },
        lte(k, v) { filters.push((r) => r[k] != null && r[k] <= v); described.push(`lte:${k}=${v}`); return q; },
        then(resolve, reject) {
          calls.push({ table, columns, filters: described });
          const data = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`PASS ${name}`); }

async function readXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const zip = await JSZip.loadAsync(buffer);
  // exceljs는 worksheet id로 파일명을 정한다 (template마다 sheet1/sheet2…) — 시트는 항상 1개
  const sheetFiles = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
  assert.equal(sheetFiles.length, 1);
  const sheetXml = await sheetFiles[0].async("string");
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const stylesXml = await zip.file("xl/styles.xml").async("string");
  const breaks = [...sheetXml.matchAll(/<brk id="(\d+)"/g)].map((m) => Number(m[1]));
  const printArea = /_xlnm\.Print_Area[^>]*>([^<]+)</.exec(workbookXml)?.[1]?.replaceAll("&apos;", "'") ?? null;
  return { workbook, sheet: workbook.worksheets[0], sheetXml, workbookXml, stylesXml, breaks, printArea };
}
async function responseBuffer(response) {
  return Buffer.from(await response.arrayBuffer());
}
// MONTHLY_EXCEL_ARTIFACT_DIR가 있으면 생성 파일을 남긴다 (Excel 실제 인쇄 미리보기 수동/자동 확인용)
function saveArtifact(name, buffer) {
  const dir = process.env.MONTHLY_EXCEL_ARTIFACT_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);
  }
  return buffer;
}
function decodeFilename(response) {
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get("content-disposition") ?? "")?.[1];
  return encoded ? decodeURIComponent(encoded) : null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const dateLabel = (ymd) => {
  const [y, m, d] = ymd.split("-");
  return `${y} . ${m} . ${d} ( ${WEEKDAYS[new Date(Date.UTC(+y, +m - 1, +d, 12)).getUTCDay()]} )`;
};

// ── fixtures ──
const groups = {
  A: { id: "gA", name: "A반", textbook: "Grammar A", is_exam_period: false, exam_textbooks: [] },
  B: { id: "gB", name: "B반", textbook: "Reading B", is_exam_period: true, exam_textbooks: [{ name: "백발백중" }] },
  C: { id: "gC", name: "C반", textbook: "Voca C", is_exam_period: false, exam_textbooks: [] },
  N: { id: "gN", name: "시간표없는반", textbook: "None", is_exam_period: false, exam_textbooks: [] },
};
const everyDay = (groupId, start, end) =>
  Array.from({ length: 7 }, (_, dow) => ({ id: `${groupId}-${dow}`, group_id: groupId, user_id: OWNER, day_of_week: dow, start_time: start, end_time: end }));
const LONG = Array.from({ length: 40 }, (_, i) => `${i + 1}번째 줄 — 관계대명사/분사구문 서술형 대비 긴 진도 내용`).join("\n");
const log = (id, group, date, status, progress, user = OWNER) => ({
  id, user_id: user, group_id: groups[group].id, class_date: date, status,
  default_progress: progress, lesson_content: null, textbook_progress: null, school_progress: null,
  class_groups: groups[group],
});
const dailyLogs = [
  log("l1", "A", "2026-10-31", "completed", "10월 마지막"),
  log("l2", "B", "2026-11-01", "completed", "11월 첫날"),
  log("l3", "A", "2026-11-03", "completed", "11/03 진도"),
  log("l4", "B", "2026-11-05", "completed", "11/05 B 진도"),
  log("l5", "C", "2026-11-05", "completed", "11/05 C 진도"),
  log("l6", "A", "2026-11-11", "completed", "11/11 A 진도"),
  log("l7", "B", "2026-11-11", "draft", "   "),
  log("l8", "C", "2026-11-11", "draft", "11/11 C 임시저장 진도"),
  log("l9", "C", "2026-11-28", "completed", LONG),
  log("l10", "A", "2026-11-30", "completed", "11월 마지막"),
  log("l11", "A", "2026-12-01", "completed", "12월 첫날"),
  log("l12", "A", "2026-11-15", "completed", "다른 계정 기록", "intruder"),
  log("l13", "N", "2026-09-10", "completed", "시간 없음"),
];
const schedules = [...everyDay("gA", "19:00:00", "20:20:00"), ...everyDay("gB", "17:30:00", "18:50:00"), ...everyDay("gC", "14:00:00", "15:00:00")];
const makeup = (id, status, completed, name, user = OWNER, extra = {}) => ({
  id, user_id: user, status, source: "absence", completed_date: completed, original_class_date: "2026-10-27",
  missed_progress: `${name} 놓친 진도`, completed_progress: null, start_time: null, end_time: null,
  students: { name }, direct_group: null, student_lesson_logs: { daily_logs: { group_id: "gA" } }, ...extra,
});
const makeups = [
  makeup("m1", "completed", "2026-11-01", "가나"),
  makeup("m2", "completed", "2026-11-12", "다라"),
  makeup("m3", "completed", "2026-11-12", "가다"),
  makeup("m4", "completed", "2026-11-20", "마바", OWNER, { missed_progress: "1줄\n2줄\n3줄" }),
  makeup("m5", "completed", "2026-11-30", "사아"),
  makeup("m6", "completed", "2026-10-15", "10월1"),
  makeup("m7", "completed", "2026-10-31", "10월2"),
  makeup("m8", "completed", "2026-12-01", "12월1"),
  makeup("m9", "scheduled", null, "예정", OWNER, { scheduled_date: "2026-11-25" }),
  makeup("m10", "cancelled", null, "취소"),
  makeup("m11", "completed", "2026-11-15", "다른계정", "intruder"),
];

async function main() {
  tables = { daily_logs: dailyLogs, class_group_schedules: schedules, makeup_lessons: makeups };
  scheduleFixtures = schedules;
  const { GET: teacherLogRoute } = load("app/daily-logs/export/route");
  const { GET: makeupRoute } = load("app/makeups/export/route");
  const teacherLog = load("lib/excel/teacher-log-export");
  const makeupExport = load("lib/excel/makeup-export");
  const { TEACHER_LOG_TEMPLATE } = teacherLog;
  const { blockRows } = TEACHER_LOG_TEMPLATE;

  // ── 교사일지 월간 ──
  db = mockDb(); rangeCalls.length = 0;
  let response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?month=2026-11"));
  assert.equal(response.status, 200, await response.clone().text());
  const monthly = await readXlsx(saveArtifact("teacher-log-2026-11.xlsx", await responseBuffer(response)));
  const expectedDates = ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-11", "2026-11-28", "2026-11-30"];
  const blockDate = (index) => monthly.sheet.getCell(`A${5 + index * blockRows}`).value;

  check("monthly teacher log: one sheet, KST month only (10/31·12/01 excluded), date ASC", () => {
    assert.equal(monthly.workbook.worksheets.length, 1);
    assert.equal(monthly.sheet.name, "11월 교사일지");
    assert.deepEqual(expectedDates.map((_, i) => blockDate(i)), expectedDates.map(dateLabel));
    assert.equal(monthly.sheet.getCell(`A${5 + expectedDates.length * blockRows}`).value, null);
    assert.equal(decodeFilename(response), "강사일지_2026-11.xlsx");
  });
  check("monthly teacher log: other account's log never appears (user_id filter)", () => {
    const logQuery = db.calls.find((call) => call.table === "daily_logs");
    assert.ok(logQuery.filters.includes(`eq:user_id=${OWNER}`));
    const values = [];
    monthly.sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value))));
    assert.ok(!values.some((value) => value.includes("다른 계정 기록")));
  });
  check("monthly query pattern: batch (1 log query + 1 schedule query + 1 range call each)", () => {
    assert.deepEqual(db.calls.map((call) => call.table), ["daily_logs", "class_group_schedules"]);
    assert.ok(db.calls[0].filters.includes("gte:class_date=2026-11-01") && db.calls[0].filters.includes("lte:class_date=2026-11-30"));
    assert.deepEqual(rangeCalls.map((call) => call.join(" ")).sort(), [
      "closures 2026-11-01 2026-11-30", "exceptions 2026-11-01 2026-11-30", "holidays 2026-11-01 2026-11-30", "supplements 2026-11-01 2026-11-30",
    ]);
  });
  check("monthly teacher log: same-day periods by start time, draft rule same as daily", () => {
    const offset = 2 * blockRows; // 11/05
    assert.equal(monthly.sheet.getCell(`L${13 + offset}`).value, "11/05 C 진도"); // 14:00 → 1교시
    assert.equal(monthly.sheet.getCell(`L${21 + offset}`).value, "11/05 B 진도"); // 17:30 → 2교시
    assert.equal(monthly.sheet.getCell(`E${21 + offset}`).value, "백발백중");
    assert.equal(monthly.sheet.getCell(`C${13 + offset}`).value, "2:00\n~\n3:00");
    const nov11 = 3 * blockRows;
    assert.equal(monthly.sheet.getCell(`L${13 + nov11}`).value, "11/11 C 임시저장 진도"); // 내용 있는 draft 포함
    assert.equal(monthly.sheet.getCell(`L${21 + nov11}`).value, "11/11 A 진도");
    assert.equal(monthly.sheet.getCell(`L${29 + nov11}`).value, null); // 빈 draft 제외
  });
  check("monthly teacher log: long progress kept whole (no truncation), wrap kept", () => {
    const cell = monthly.sheet.getCell(`L${13 + 4 * blockRows}`);
    assert.equal(cell.value, LONG);
    assert.equal(cell.alignment.wrapText, true);
  });
  check("monthly teacher log: page break after every block except the last, print area = blocks", () => {
    assert.deepEqual(monthly.breaks, [1, 2, 3, 4, 5].map((i) => i * blockRows));
    assert.equal(monthly.printArea, `'11월 교사일지'!$A1:$AU${expectedDates.length * blockRows}`);
    assert.ok(!monthly.breaks.includes(0));
  });
  check("monthly teacher log: original print setup kept (A4 portrait, margins 0, centered) + fit 1 page wide, tall auto", () => {
    const pageSetup = /<pageSetup[^>]*>/.exec(monthly.sheetXml)[0];
    assert.match(pageSetup, /paperSize="9"/);
    assert.match(pageSetup, /orientation="portrait"/);
    assert.match(pageSetup, /fitToWidth="1"/);
    assert.match(pageSetup, /fitToHeight="0"/);
    assert.match(monthly.sheetXml, /<pageSetUpPr fitToPage="1"\/>/);
    assert.match(monthly.sheetXml, /<pageMargins left="0" right="0" top="0" bottom="0" header="0" footer="0"\/>/);
    assert.match(monthly.sheetXml, /<printOptions horizontalCentered="1" verticalCentered="1"\/>/);
  });
  check("monthly teacher log: every block is an exact copy of the form (styles/heights/merges/labels)", () => {
    assert.equal(monthly.sheet.model.merges.length, 50 * expectedDates.length);
    for (let block = 1; block < expectedDates.length; block += 1) {
      const offset = block * blockRows;
      for (let row = 1; row <= blockRows; row += 1) {
        assert.equal(monthly.sheet.getRow(row + offset).height, monthly.sheet.getRow(row).height, `row ${row} block ${block}`);
        for (const col of [1, 3, 5, 12, 20, 39, 40, 47]) {
          assert.deepEqual(monthly.sheet.getCell(row + offset, col).style.border, monthly.sheet.getCell(row, col).style.border, `border r${row}c${col}`);
          assert.deepEqual(monthly.sheet.getCell(row + offset, col).style.font, monthly.sheet.getCell(row, col).style.font);
        }
      }
      assert.equal(monthly.sheet.getCell(`A${11 + offset}`).value, "교시");
      assert.equal(monthly.sheet.getCell(`A${71 + offset}`).value, "출근시간");
      assert.equal(monthly.sheet.getCell(`H${7 + offset}`).value, "김다빈");
      assert.deepEqual(monthly.sheet.getCell(`I${71 + offset}`).value, monthly.sheet.getCell("I71").value);
    }
  });

  // ── 교사일지 일 단위 회귀 ──
  db = mockDb(); rangeCalls.length = 0;
  response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?date=2026-11-05"));
  assert.equal(response.status, 200);
  const dailyBuffer = saveArtifact("teacher-log-2026-11-05.xlsx", await responseBuffer(response));
  const daily = await readXlsx(dailyBuffer);
  check("daily export unchanged: filename, sheet, cells, no page breaks, original print area, no fit", () => {
    assert.ok(!/fitToPage="1"/.test(daily.sheetXml));
    assert.equal(decodeFilename(response), "20261105목.xlsx");
    assert.equal(daily.sheet.name, "교사일지");
    assert.equal(daily.sheet.getCell("A5").value, dateLabel("2026-11-05"));
    assert.equal(daily.sheet.getCell("L13").value, "11/05 C 진도");
    assert.equal(daily.sheet.getCell("L21").value, "11/05 B 진도");
    assert.deepEqual(daily.breaks, []);
    assert.equal(daily.printArea, "'교사일지'!$A1:$AU73");
    assert.deepEqual(db.calls.map((call) => call.table), ["daily_logs", "class_group_schedules"]);
    assert.ok(db.calls[0].filters.includes("eq:class_date=2026-11-05"));
  });
  const headTeacherLog = loadHead("lib/excel/teacher-log-export.ts", {
    "./teacher-log-template-data": load("lib/excel/teacher-log-template-data"),
  });
  const sample = { dateLabel: dateLabel("2026-11-05"), rows: [
    { startTime: "14:00:00", endTime: "15:00:00", textbook: "Voca C", progress: "11/05 C 진도" },
    { startTime: "17:30:00", endTime: "18:50:00", textbook: "백발백중", progress: LONG },
  ] };
  const [headDaily, newDaily] = await Promise.all([
    headTeacherLog.fillTeacherLogTemplate(sample).then(readXlsx),
    teacherLog.fillTeacherLogTemplate(sample).then(readXlsx),
  ]);
  check("daily teacher log workbook is byte-identical to HEAD (sheet/workbook/styles XML)", () => {
    assert.equal(newDaily.sheetXml, headDaily.sheetXml);
    assert.equal(newDaily.workbookXml, headDaily.workbookXml);
    assert.equal(newDaily.stylesXml, headDaily.stylesXml);
  });

  // ── 시간 확정 실패 / 빈 달 / 잘못된 달 ──
  db = mockDb();
  response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?month=2026-09"));
  const failBody = await response.json();
  check("monthly teacher log: undeterminable time fails with the date (no guessing, no silent drop)", () => {
    assert.equal(response.status, 400);
    assert.match(failBody.error, /^9\/10\(목\) — 시간표없는반의 수업 시간을 확인할 수 없어/);
  });
  db = mockDb();
  response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?month=2026-08"));
  const emptyBody = await response.json();
  check("empty month: no workbook, friendly message", () => {
    assert.equal(response.status, 400);
    assert.equal(emptyBody.error, "2026년 8월에는 내보낼 수업 기록이 없어요.");
    assert.equal(db.calls.length, 1); // 시간표 조회까지 가지 않는다
  });
  response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?month=2026-13"));
  check("invalid month rejected", () => assert.equal(response.status, 400));

  // ── 보충 수업 월간 ──
  db = mockDb();
  response = await makeupRoute(new Request("http://localhost/makeups/export?month=2026-11"));
  assert.equal(response.status, 200, await response.clone().text());
  const makeupMonthly = await readXlsx(saveArtifact("makeups-2026-11.xlsx", await responseBuffer(response)));
  const names = (sheet, count) => Array.from({ length: count }, (_, i) => sheet.getCell(3 + i, 3).value);
  check("monthly makeup: completed in KST month only (5), other months/status/account excluded", () => {
    assert.deepEqual(names(makeupMonthly.sheet, 6), ["가나", "가다", "다라", "마바", "사아", null]);
    assert.deepEqual(Array.from({ length: 5 }, (_, i) => makeupMonthly.sheet.getCell(3 + i, 1).value), ["2026-11-01", "2026-11-12", "2026-11-12", "2026-11-20", "2026-11-30"]);
    const query = db.calls.find((call) => call.table === "makeup_lessons");
    assert.ok(query.filters.includes("eq:status=completed") && query.filters.includes(`eq:user_id=${OWNER}`));
    assert.ok(query.filters.includes("gte:completed_date=2026-11-01") && query.filters.includes("lte:completed_date=2026-11-30"));
    assert.equal(db.calls.filter((call) => call.table === "makeup_lessons").length, 1);
    assert.equal(decodeFilename(response), "강사일지_보충수업_2026-11.xlsx");
  });
  check("monthly makeup: single band = one page, no blank second form page, print area A1:F25", () => {
    assert.equal(makeupMonthly.sheet.name, "11월 보충수업");
    assert.equal(makeupMonthly.sheet.actualRowCount, 25); // 두 번째 빈 양식 밴드는 비워짐
    for (let row = 26; row <= 50; row += 1) {
      for (let col = 1; col <= 6; col += 1) {
        assert.equal(makeupMonthly.sheet.getCell(row, col).value, null);
        assert.equal(Object.keys(makeupMonthly.sheet.getCell(row, col).border ?? {}).length, 0);
      }
    }
    assert.deepEqual(makeupMonthly.breaks, []);
    assert.equal(makeupMonthly.printArea, "'11월 보충수업'!$A1:$F25");
    assert.equal(makeupMonthly.sheet.model.merges.length, 25);
    assert.equal(makeupMonthly.sheet.getCell("A1").value, "보  충  수  업");
    assert.equal(makeupMonthly.sheet.getCell("D6").value, "1줄\n2줄\n3줄");
    const pageSetup = /<pageSetup[^>]*>/.exec(makeupMonthly.sheetXml)[0];
    assert.match(pageSetup, /paperSize="9"/);
    assert.match(pageSetup, /orientation="portrait"/);
    assert.match(pageSetup, /fitToWidth="1"/);
    assert.match(pageSetup, /fitToHeight="0"/);
    assert.match(makeupMonthly.sheetXml, /<pageSetUpPr fitToPage="1"\/>/);
    assert.match(makeupMonthly.sheetXml, /<pageMargins left="0.79" right="0.39" top="0.59" bottom="0.59" header="0" footer="0"\/>/);
  });
  const manyRows = (count) => Array.from({ length: count }, (_, i) => ({ date: `2026-11-${String(1 + (i % 28)).padStart(2, "0")}`, timeLabel: "", name: `학생${i}`, content: `진도 ${i}`, absenceDate: "" }));
  const thirty = await readXlsx(await makeupExport.fillMakeupTemplate(manyRows(30), { minBands: 1, sheetName: "11월 보충수업", fitToWidth: true }));
  const fifty = await readXlsx(saveArtifact("makeups-50-rows.xlsx", await makeupExport.fillMakeupTemplate(manyRows(50), { minBands: 1, sheetName: "11월 보충수업", fitToWidth: true })));
  check("monthly makeup: band page breaks for 30 and 50 records (each band starts a page)", () => {
    assert.deepEqual(thirty.breaks, [25]);
    assert.equal(thirty.printArea, "'11월 보충수업'!$A1:$F50");
    assert.deepEqual(fifty.breaks, [25, 50]);
    assert.equal(fifty.printArea, "'11월 보충수업'!$A1:$F75");
    assert.equal(fifty.sheet.getCell(51, 1).value, "보  충  수  업");
    assert.equal(fifty.sheet.getCell(52 + 6, 3).value, "학생49");
  });
  db = mockDb();
  response = await makeupRoute(new Request("http://localhost/makeups/export?month=2026-08"));
  const makeupEmpty = await response.json();
  check("monthly makeup empty month: no workbook, friendly message", () => {
    assert.equal(response.status, 400);
    assert.equal(makeupEmpty.error, "2026년 8월에는 내보낼 완료된 보충 수업이 없어요.");
  });

  // ── 보충 수업 전체(기존) 회귀 ──
  db = mockDb();
  response = await makeupRoute(new Request("http://localhost/makeups/export"));
  const makeupAll = await readXlsx(await responseBuffer(response));
  check("existing all-history makeup export: same filename/sheet/2-band form, all completed rows", () => {
    assert.equal(decodeFilename(response), "강사일지_보충수업.xlsx");
    assert.equal(makeupAll.sheet.name, "보충수업");
    assert.equal(names(makeupAll.sheet, 9).filter(Boolean).length, 8);
    assert.equal(makeupAll.sheet.getCell(26, 1).value, "보  충  수  업");
    assert.deepEqual(makeupAll.breaks, [25]);
    assert.equal(makeupAll.printArea, "'보충수업'!$A1:$F50");
  });
  const headMakeup = loadHead("lib/excel/makeup-export.ts", {
    "./makeup-template-data": load("lib/excel/makeup-template-data"),
  });
  const stripPrint = (xml) => xml.replace(/<rowBreaks[\s\S]*?<\/rowBreaks>/, "").replace(/<definedNames>[\s\S]*?<\/definedNames>/, "");
  for (const count of [8, 30, 60]) {
    const rows = manyRows(count);
    rows[3].content = "여러\n줄\n내용";
    const [headBook, newBook] = await Promise.all([
      headMakeup.fillMakeupTemplate(rows).then(readXlsx),
      makeupExport.fillMakeupTemplate(rows).then(readXlsx),
    ]);
    check(`existing makeup workbook identical to HEAD except added page breaks/print area (${count} rows)`, () => {
      assert.equal(stripPrint(newBook.sheetXml), stripPrint(headBook.sheetXml));
      assert.equal(stripPrint(newBook.workbookXml), stripPrint(headBook.workbookXml));
      assert.equal(newBook.stylesXml, headBook.stylesXml);
    });
  }

  console.log(`${checks} monthly Excel checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
