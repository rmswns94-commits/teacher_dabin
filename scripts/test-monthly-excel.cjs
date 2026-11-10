/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS harness; no new application dependencies (jszip ships with exceljs). */
// 월간 Excel 내보내기 검증 — route를 mock DB로 실행해 실제 xlsx를 만들고 다시 읽어 확인한다.
// 인쇄 설정(페이지 나누기/인쇄 영역/용지)은 exceljs가 다시 읽지 못하는 항목이 있어 XML로 직접 확인.
// 기존 일 단위 export는 월간 기능 이전 코드(BASELINE)가 만든 파일과 sheet XML을 비교해 회귀가 없음을 확인한다.
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
// 월간 Excel 기능 이전 커밋 — 기존 일 단위/전체 기록 출력의 회귀 비교 기준
const BASELINE = "809ead5";
function loadHead(relative, overrides) {
  const source = execSync(`git show ${BASELINE}:${relative}`, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
  // exceljs는 worksheet id로 파일명을 정한다 (template마다 sheet1/sheet2…) — 번호순 = 시트 순서
  const sheetFiles = zip
    .file(/^xl\/worksheets\/sheet\d+\.xml$/)
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a.name)[1]) - Number(/(\d+)\.xml$/.exec(b.name)[1]));
  const sheetXmls = await Promise.all(sheetFiles.map((file) => file.async("string")));
  const sheetXml = sheetXmls[0];
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const stylesXml = await zip.file("xl/styles.xml").async("string");
  const breaks = [...sheetXml.matchAll(/<brk id="(\d+)"/g)].map((m) => Number(m[1]));
  const printAreas = [...workbookXml.matchAll(/_xlnm\.Print_Area[^>]*>([^<]+)</g)].map((m) => m[1].replaceAll("&apos;", "'"));
  const printArea = printAreas[0] ?? null;
  return { workbook, sheet: workbook.worksheets[0], sheetXml, sheetXmls, workbookXml, stylesXml, breaks, printArea, printAreas };
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
  const BLOCK_ROWS = 73; // 양식 A1:AU73
  const sheetName = (ymd) => `${ymd.slice(5, 7)}-${ymd.slice(8, 10)}(${dateLabel(ymd).slice(-3, -2)})`;

  // ── 교사일지 월간 ──
  db = mockDb(); rangeCalls.length = 0;
  let response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?month=2026-11"));
  assert.equal(response.status, 200, await response.clone().text());
  const monthly = await readXlsx(saveArtifact("teacher-log-2026-11.xlsx", await responseBuffer(response)));
  const expectedDates = ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-11", "2026-11-28", "2026-11-30"];
  const sheets = monthly.workbook.worksheets;
  const sheetOf = (ymd) => sheets[expectedDates.indexOf(ymd)];

  check("monthly teacher log: one form sheet per date, KST month only (10/31·12/01 excluded), date ASC", () => {
    assert.deepEqual(sheets.map((sheet) => sheet.name), expectedDates.map(sheetName));
    assert.equal(sheets[0].name, "11-01(일)");
    assert.deepEqual(sheets.map((sheet) => sheet.getCell("A5").value), expectedDates.map(dateLabel));
    assert.equal(decodeFilename(response), "강사일지_2026-11.xlsx");
  });
  check("monthly teacher log: other account's log never appears (user_id filter)", () => {
    const logQuery = db.calls.find((call) => call.table === "daily_logs");
    assert.ok(logQuery.filters.includes(`eq:user_id=${OWNER}`));
    const values = [];
    for (const sheet of sheets) sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value))));
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
    const nov5 = sheetOf("2026-11-05");
    assert.equal(nov5.getCell("L13").value, "11/05 C 진도"); // 14:00 → 1교시
    assert.equal(nov5.getCell("L21").value, "11/05 B 진도"); // 17:30 → 2교시
    assert.equal(nov5.getCell("E21").value, "백발백중");
    assert.equal(nov5.getCell("C13").value, "2:00\n~\n3:00");
    const nov11 = sheetOf("2026-11-11");
    assert.equal(nov11.getCell("L13").value, "11/11 C 임시저장 진도"); // 내용 있는 draft 포함
    assert.equal(nov11.getCell("L21").value, "11/11 A 진도");
    assert.equal(nov11.getCell("L29").value, null); // 빈 draft 제외
  });
  check("monthly teacher log: long progress kept whole, its period band grows to fit (others untouched)", () => {
    const nov28 = sheetOf("2026-11-28"); // 40줄 진도
    const cell = nov28.getCell("L13");
    assert.equal(cell.value, LONG);
    assert.equal(cell.alignment.wrapText, true);
    // 40줄 × 10pt + 여백이 Windows Excel 높이(XML × 0.67) 안에 들어가도록 1교시 8행이 늘어난다
    const bandXml = Array.from({ length: 8 }, (_, i) => nov28.getRow(13 + i).height).reduce((a, b) => a + b, 0);
    assert.ok(bandXml * 0.67 >= 40 * 10 + 3, `band ${bandXml}`);
    for (let row = 21; row <= BLOCK_ROWS; row += 1) {
      assert.equal(nov28.getRow(row).height, sheets[0].getRow(row).height, `row ${row}`);
    }
  });
  check("monthly teacher log: every date sheet = one page (fit 1×1), original A4 portrait/margins/centering, print area A1:AU73", () => {
    assert.equal(monthly.sheetXmls.length, expectedDates.length);
    monthly.sheetXmls.forEach((xml) => {
      const pageSetup = /<pageSetup[^>]*>/.exec(xml)[0];
      assert.match(pageSetup, /paperSize="9"/);
      assert.match(pageSetup, /orientation="portrait"/);
      assert.match(pageSetup, /fitToWidth="1"/);
      assert.match(pageSetup, /fitToHeight="1"/);
      assert.match(xml, /<pageSetUpPr fitToPage="1"\/>/);
      assert.match(xml, /<pageMargins left="0" right="0" top="0" bottom="0" header="0" footer="0"\/>/);
      assert.match(xml, /<printOptions horizontalCentered="1" verticalCentered="1"\/>/);
      assert.ok(!/<rowBreaks/.test(xml));
    });
    assert.deepEqual(monthly.printAreas, expectedDates.map((ymd) => `'${sheetName(ymd)}'!$A1:$AU73`));
    // 복제 시트는 선택되지 않음 — 시트 여러 개가 그룹 선택된 채 열리지 않게 (활성 시트 = 첫 날짜)
    assert.ok(monthly.sheetXmls.slice(1).every((xml) => !/tabSelected="1"/.test(xml)));
    assert.ok(!/activeTab="[1-9]/.test(monthly.workbookXml));
  });
  check("monthly teacher log: every date sheet is an exact copy of the form (styles/heights/widths/merges/labels)", () => {
    const first = sheets[0];
    // 셀마다 XML 스타일 인덱스(s)가 같으면 테두리/글꼴/정렬/표시형식이 완전히 같다
    const styleMap = (xml) => [...xml.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?/g)].map((m) => `${m[1]}:${m[2] ?? 0}`).join(",");
    const firstStyles = styleMap(monthly.sheetXmls[0]);
    monthly.sheetXmls.slice(1).forEach((xml, i) => assert.equal(styleMap(xml), firstStyles, `styles of sheet ${i + 2}`));
    for (const sheet of sheets.slice(1)) {
      assert.equal(sheet.model.merges.length, 50);
      assert.deepEqual([...sheet.model.merges].sort(), [...first.model.merges].sort());
      for (let col = 1; col <= 47; col += 1) assert.equal(sheet.getColumn(col).width, first.getColumn(col).width);
      for (let row = 1; row <= BLOCK_ROWS; row += 1) {
        const grownBand = sheet.name === sheetName("2026-11-28") && row >= 13 && row <= 20; // 위에서 따로 확인
        if (!grownBand) {
          assert.equal(sheet.getRow(row).height, first.getRow(row).height, `${sheet.name} row ${row}`);
        }
      }
      assert.equal(sheet.getCell("A11").value, "교시");
      assert.equal(sheet.getCell("A71").value, "출근시간");
      assert.equal(sheet.getCell("H7").value, "김다빈");
      assert.deepEqual(sheet.getCell("I71").value, first.getCell("I71").value);
    }
  });

  // ── 교사일지 일 단위 회귀 ──
  db = mockDb(); rangeCalls.length = 0;
  response = await teacherLogRoute(new Request("http://localhost/daily-logs/export?date=2026-11-05"));
  assert.equal(response.status, 200);
  const dailyBuffer = saveArtifact("teacher-log-2026-11-05.xlsx", await responseBuffer(response));
  const daily = await readXlsx(dailyBuffer);
  check("daily export: same filename/sheet/cells, no page breaks, original print area, fit to one page", () => {
    // 하루 = 한 장 — 맥·아이패드처럼 행을 크게 그리는 앱에서도 넘치지 않게 (Windows는 축소 없음)
    assert.match(daily.sheetXml, /<pageSetUpPr fitToPage="1"\/>/);
    assert.match(/<pageSetup[^>]*>/.exec(daily.sheetXml)[0], /fitToWidth="1" fitToHeight="1"/);
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
  // 칸 안에 들어가는 내용(5줄까지)은 기존과 완전히 같아야 한다
  const FIVE_LINES = ["[시험 대비]", "가산중학교 · 중2 - 5과: 목관대 개념 설명", "한울중학교 · 중2 - 7과", "[일반 수업]", "Grammar Inside 2 - Unit 6 p.42~47"].join("\n");
  const sample = { dateLabel: dateLabel("2026-11-05"), rows: [
    { startTime: "14:00:00", endTime: "15:00:00", textbook: "Voca C", progress: "11/05 C 진도" },
    { startTime: "17:30:00", endTime: "18:50:00", textbook: "백발백중\nGrammar Inside 2", progress: FIVE_LINES },
  ] };
  const [headDaily, newDaily] = await Promise.all([
    headTeacherLog.fillTeacherLogTemplate(sample).then(readXlsx),
    teacherLog.fillTeacherLogTemplate(sample).then(readXlsx),
  ]);
  check("daily teacher log workbook = baseline + only the one-page fit flag when content fits (sheet/workbook/styles XML)", () => {
    const withoutFit = (xml) => xml.replace(/<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/, "");
    assert.notEqual(newDaily.sheetXml, withoutFit(newDaily.sheetXml));
    assert.equal(withoutFit(newDaily.sheetXml), headDaily.sheetXml);
    assert.equal(newDaily.workbookXml, headDaily.workbookXml);
    assert.equal(newDaily.stylesXml, headDaily.stylesXml);
  });
  const longSample = { ...sample, rows: [sample.rows[0], { ...sample.rows[1], progress: LONG }] };
  const longBuffer = saveArtifact("teacher-log-long-day.xlsx", await teacherLog.fillTeacherLogTemplate(longSample));
  const [headLong, newLong] = await Promise.all([
    headTeacherLog.fillTeacherLogTemplate(longSample).then(readXlsx),
    readXlsx(longBuffer),
  ]);
  check("daily teacher log with overflowing progress: only that period's rows grow, values unchanged", () => {
    for (let row = 1; row <= BLOCK_ROWS; row += 1) {
      const inBand = row >= 21 && row <= 28;
      const before = headLong.sheet.getRow(row).height;
      const after = newLong.sheet.getRow(row).height;
      if (inBand) {
        assert.ok(after > before, `row ${row} should grow`);
      } else {
        assert.equal(after, before, `row ${row}`);
      }
      for (let col = 1; col <= 47; col += 1) {
        assert.deepEqual(newLong.sheet.getCell(row, col).value, headLong.sheet.getCell(row, col).value);
      }
    }
    assert.deepEqual(newLong.sheet.model.merges, headLong.sheet.model.merges);
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
    assert.equal(makeupMonthly.sheet.getRow(25).hidden, true); // 밴드 끝 빈 구분행은 인쇄에서 숨김
    assert.equal(makeupMonthly.sheet.getRow(24).hidden, false);
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
  const thirty = await readXlsx(await makeupExport.fillMakeupTemplate(manyRows(30), { minBands: 1, sheetName: "11월 보충수업" }));
  const fifty = await readXlsx(saveArtifact("makeups-50-rows.xlsx", await makeupExport.fillMakeupTemplate(manyRows(50), { minBands: 1, sheetName: "11월 보충수업" })));
  check("monthly makeup: band page breaks for 30 and 50 records (each band starts a page)", () => {
    assert.deepEqual(thirty.breaks, [25]);
    assert.equal(thirty.printArea, "'11월 보충수업'!$A1:$F50");
    assert.deepEqual(fifty.breaks, [25, 50]);
    assert.deepEqual([25, 50, 75].map((row) => fifty.sheet.getRow(row).hidden), [true, true, true]);
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
    assert.deepEqual([25, 50].map((row) => makeupAll.sheet.getRow(row).hidden), [true, true]);
    assert.equal(makeupAll.printArea, "'보충수업'!$A1:$F50");
    // 원본 양식은 A4 세로 폭보다 넓어 가로 1페이지 맞춤(세로 자동)을 적용한다
    assert.match(makeupAll.sheetXml, /<pageSetUpPr fitToPage="1"\/>/);
    assert.match(/<pageSetup[^>]*>/.exec(makeupAll.sheetXml)[0], /fitToWidth="1" fitToHeight="0"/);
  });
  const headMakeup = loadHead("lib/excel/makeup-export.ts", {
    "./makeup-template-data": load("lib/excel/makeup-template-data"),
  });
  // 의도한 인쇄 설정 추가분(페이지 나누기/인쇄 영역/가로 맞춤)만 걷어내면 기준과 같아야 한다
  const stripPrint = (xml) =>
    xml
      .replace(/<rowBreaks[\s\S]*?<\/rowBreaks>/, "")
      .replace(/<definedNames>[\s\S]*?<\/definedNames>/, "")
      .replace(/<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/, "")
      .replace(/ fitToWidth="1" fitToHeight="0"/, "")
      .replace(/ hidden="1"/g, "");
  for (const count of [8, 30, 60]) {
    const rows = manyRows(count);
    rows[3].content = "여러\n줄\n내용";
    const [headBook, newBook] = await Promise.all([
      headMakeup.fillMakeupTemplate(rows).then(readXlsx),
      makeupExport.fillMakeupTemplate(rows).then(readXlsx),
    ]);
    check(`existing makeup workbook identical to baseline except added print setup (${count} rows)`, () => {
      assert.equal(stripPrint(newBook.sheetXml), stripPrint(headBook.sheetXml));
      assert.equal(stripPrint(newBook.workbookXml), stripPrint(headBook.workbookXml));
      assert.equal(newBook.stylesXml, headBook.stylesXml);
    });
  }
  // 줄바꿈 없는 긴 보충 내용도 칸 폭을 넘어 감기는 줄만큼 행이 높아진다 (인쇄에서 잘리지 않게)
  const longLine = manyRows(3);
  longLine[1].content = "가나다라마바사아자차".repeat(6); // 60자 → 206pt 칸에서 3줄
  const longLineBook = await readXlsx(saveArtifact("makeups-long-line.xlsx", await makeupExport.fillMakeupTemplate(longLine)));
  check("makeup long single-line content: row grows by wrapped lines, short rows keep 30", () => {
    assert.equal(longLineBook.sheet.getRow(4).height, 3 * 16 + 6);
    assert.equal(longLineBook.sheet.getRow(3).height, 30);
    assert.equal(longLineBook.sheet.getRow(5).height, 30);
    assert.equal(longLineBook.sheet.getCell("D4").value, longLine[1].content);
  });

  console.log(`${checks} monthly Excel checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
