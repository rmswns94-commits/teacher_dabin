/* eslint-disable @typescript-eslint/no-require-imports -- Optional standalone browser harness, no application dependencies added. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const runtime = process.env.PROGRESS_TEST_RUNTIME || path.join(os.tmpdir(), "teacher-dabin-phase4-browser/node_modules");
const { build } = require(path.join(runtime, "esbuild"));
const { chromium } = require(path.join(runtime, "playwright"));
const artifacts = path.join(os.tmpdir(), "teacher-dabin-manual-plans");
const stubs = {
  "next/link": `import React from 'react'; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }`,
  "next/navigation": `const router={replace:p=>window.lastRoute=p,push:p=>window.lastRoute=p,refresh:()=>{}}; export const useRouter=()=>router;`,
  "@/components/lesson-history-panel": `const history={register:()=>()=>{}}; export const useHistoryImport=()=>history;`,
  "@/app/students/weakness-actions": `export const createStudentWeaknessAction=async()=>({});`,
  "@/app/daily-logs/actions": `
    import { dailyLogSchema } from '@/lib/validation/daily-log';
    export async function autosaveDailyLogDraftAction(input) {
      window.autosaves.push(structuredClone(input));
      localStorage.setItem('draft-'+input.groupId,JSON.stringify(input.payload));
      return {draftId:'draft',updatedAt:new Date().toISOString()};
    }
    export const discardDailyLogDraftAction=async()=>({success:true});
    export async function saveDailyLogAction(input) {
      const parsed=dailyLogSchema.safeParse(input);
      if(!parsed.success) {window.saveError=parsed.error.message; return {error:parsed.error.message};}
      window.saves.push(structuredClone(parsed.data));
      return {success:true,dailyLogId:'saved-log',classDate:input.classDate,completed:input.status==='completed'};
    }`,
};
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {DailyLogForm} from './components/daily-log-form';
import * as manual from './lib/manual-progress';
import {formatMixedProgressForExcel} from './lib/mixed-display';
window.manual=manual;window.excel=formatMixedProgressForExcel;
window.autosaves=[];window.saves=[];
const students=[
 {studentId:'11111111-1111-4111-8111-111111111111',name:'시험학생',school:'한울중',grade:'middle_2'},
 {studentId:'22222222-2222-4222-8222-222222222222',name:'일반학생',school:'가산중',grade:'middle_2'},
 {studentId:'33333333-3333-4333-8333-333333333333',name:'미등록학생',school:null,grade:'middle_2'},
];
const defaults={classDate:'2026-09-14',group:{id:'44444444-4444-4444-8444-444444444444',name:'A'},
 students, scheduleDays:[1,3,5], textbooks:['Grammar','Reading','Bricks'], examPeriod:true,examTargetSchools:['한울중'],schools:['한울중','가산중']};
window.defaults=defaults;
const app=createRoot(document.getElementById('app'));let generation=0;
window.mount=(overrides={})=>{window.saves=[];window.saveError=null;window.lastRoute=null;flushSync(()=>app.render(<DailyLogForm key={++generation} {...defaults} {...overrides}/>));};
const stored=localStorage.getItem('draft-'+defaults.group.id);
window.mount(stored?{draft:{id:'draft',updatedAt:new Date().toISOString(),payload:JSON.parse(stored)},forceRestoreDraft:true}:{});
`;

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const bundled = await build({ stdin: { contents: entry, resolveDir: root, loader: "jsx" },
    absWorkingDir: root, bundle: true, write: false, platform: "browser", jsx: "automatic",
    plugins: [{ name: "test-boundaries", setup(api) {
      api.onResolve({ filter: /.*/ }, (args) => {
        if (stubs[args.path]) return { path: args.path, namespace: "stub" };
        if (args.path.startsWith("@/")) return { path: path.join(root, args.path.slice(2)) + (fs.existsSync(path.join(root, args.path.slice(2)) + ".ts") ? ".ts" : ".tsx") };
        if (args.namespace === "stub" && args.path === "react") return { path: require.resolve("react") };
      });
      api.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "jsx", resolveDir: root }));
    } }],
  });
  const cssDir = path.join(root, ".next/static/chunks");
  const css = fs.readdirSync(cssDir).filter((p) => p.endsWith(".css")).map((p) => fs.readFileSync(path.join(cssDir, p), "utf8")).join("\n");
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main class="min-w-0 p-5" id="app"></main><script src="/app.js"></script></body></html>`;
  const server = http.createServer((req, res) => { res.setHeader("Content-Type", req.url === "/app.js" ? "text/javascript" : "text/html"); res.end(req.url === "/app.js" ? bundled.outputFiles[0].text : html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let checks = 0;
  const pass = (name) => { checks++; console.log(`PASS ${name}`); };
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => Boolean(window.mount));
    await page.clock.install();
    const mount = async (props) => { await page.evaluate((p) => window.mount(p), props); };
    const add = () => page.getByRole("button", { name: "교재 계획 추가", exact: true });
    const selects = () => page.getByRole("combobox", { name: "일반 계획 교재 선택" });
    const field = name => page.getByRole("textbox", { name, exact: true });
    await mount({ examPeriod: false });
    assert.equal(await add().count(), 0);
    for (const book of ["Grammar", "Reading", "Bricks"]) assert.equal(await field(`${book} 다음 수업 계획`).count(), 1);
    pass("OFF retains all automatic textbook plan inputs");
    await mount({ examTargetSchools: null });
    assert.equal(await add().count(), 0); assert.equal(await field("가산중 다음 수업 계획").count(), 1);
    pass("legacy exam keeps school-only inputs");
    await mount({ examTargetSchools: ["한울중", "없는학교"] });
    assert.equal(await selects().count(), 0); assert.equal(await add().count(), 1);
    assert.equal(await field("한울중 다음 수업 계획").count(), 1);
    assert.equal(await field("가산중 다음 수업 계획").count(), 0);
    assert.equal(await field("없는학교 다음 수업 계획").count(), 0);
    pass("mixed initial uses active target schools and zero automatic textbook plans");
    await add().click(); await selects().first().selectOption("Grammar");
    const raw = "  Unit 6 마무리\np.50~55\n관계대명사 복습  ";
    await field("Grammar 계획").fill(raw);
    const id = await page.locator("[data-plan-id]").first().getAttribute("data-plan-id");
    await add().click();
    assert.equal(await selects().nth(1).locator('option[value="Grammar"]').evaluate(el => el.disabled), true);
    assert.deepEqual(await selects().nth(1).locator("option").allTextContents(), ["교재를 선택해주세요", "Grammar", "Reading", "Bricks"]);
    await selects().nth(1).selectOption("Reading"); await field("Reading 계획").fill("Unit 5 독해 시작");
    assert.equal(await field("Bricks 계획").count(), 0);
    await field("한울중 다음 수업 계획").fill("5과 마무리\n서술형");
    pass("multiple plans, regular-only options, duplicate prevention and no unused books");
    await page.clock.fastForward(60_001); await page.waitForFunction(() => window.autosaves.length > 0);
    const payload = await page.evaluate(() => window.autosaves.at(-1).payload);
    assert.equal(payload.manualTextbookPlans[0].id, id); assert.equal(payload.manualTextbookPlans[0].text, raw);
    assert.deepEqual(payload.textbookPlans.map(x => x.name), ["Grammar", "Reading"]);
    assert.equal(payload.schoolPlans[0].text, "5과 마무리\n서술형");
    await page.reload(); await page.waitForFunction(() => Boolean(window.mount));
    assert.equal(await page.locator("[data-plan-id]").first().getAttribute("data-plan-id"), id);
    assert.equal(await field("Grammar 계획").inputValue(), raw);
    pass("60-second Draft autosave and reload preserve IDs, order and raw multiline");
    const draft = { id: "draft", updatedAt: new Date().toISOString(), payload };
    await mount({ group: { id: "55555555-5555-4555-8555-555555555555", name: "B" } });
    assert.equal(await selects().count(), 0);
    await mount({ draft, forceRestoreDraft: true });
    assert.equal(await selects().count(), 2); assert.equal(await page.locator("[data-plan-id]").first().getAttribute("data-plan-id"), id);
    pass("A-B-A isolates groups and restores Draft without duplicates");
    await page.getByRole("button", { name: "Grammar 계획 삭제", exact: true }).click();
    assert.equal(await selects().count(), 1); assert.equal(await field("Reading 계획").inputValue(), "Unit 5 독해 시작");
    assert.equal(await field("한울중 다음 수업 계획").inputValue(), "5과 마무리\n서술형");
    await page.getByRole("button", { name: "수업 기록 완료", exact: true }).first().click();
    await page.getByRole("button", { name: "수업 마무리 완료", exact: true }).click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    const final = await page.evaluate(() => ({ data: window.saves.at(-1), error: window.saveError }));
    assert.equal(final.error, null);
    assert.deepEqual(final.data.textbookPlans, [{ name: "Reading", text: "Unit 5 독해 시작" }]);
    assert.deepEqual(final.data.schoolPlans, [{ name: "한울중", text: "5과 마무리\n서술형" }]);
    assert.ok(final.data.nextLessonPlan.includes("Reading - Unit 5 독해 시작"));
    assert.equal(final.data.tasks.length, 0); assert.equal(final.data.homeworkAssignments.length, 0);
    pass("delete affects one plan; Final Save keeps structured plans and legacy mirror without tasks/homework");
    const legacy = { textbookPlans: [{ name: "Removed Book", text: "과거 계획" }, { name: "Grammar", text: "기존 문법" }], schoolPlans: [{ name: "옛학교", text: "과거 시험" }] };
    await mount({ draft: { ...draft, payload: legacy }, forceRestoreDraft: true, currentHomeworkStudents: [], examTargetSchools: [] });
    assert.equal(await selects().count(), 2); assert.equal(await add().count(), 0);
    assert.equal(await field("Removed Book 계획").inputValue(), "과거 계획");
    assert.equal(await field("옛학교 다음 수업 계획").inputValue(), "과거 시험");
    await mount({ initial: legacy, textbooks: [], currentHomeworkStudents: [] });
    assert.equal(await selects().count(), 2); assert.equal(await field("Removed Book 계획").inputValue(), "과거 계획");
    pass("old Draft and finalized edit preserve removed books/schools with zero regular students");
    await mount({ currentHomeworkStudents: [] }); assert.equal(await add().count(), 0); assert.equal(await selects().count(), 0);
    await mount({ textbooks: [] }); assert.equal(await add().isDisabled(), true);
    assert.ok(await page.getByText("등록된 일반 교재가 없어요.", { exact: false }).count() > 0);
    pass("zero regular students hidden; zero regular books disabled, no exam book fallback");
    await mount({ initial: { nextLessonPlan: "이전 원문\n  그대로 보존" } });
    assert.equal(await field("기타 계획 메모").inputValue(), "이전 원문\n  그대로 보존"); assert.equal(await selects().count(), 0);
    await add().click(); await selects().first().selectOption("Grammar"); await add().click();
    await page.getByRole("button", { name: "임시 저장", exact: true }).first().click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    assert.deepEqual(await page.evaluate(() => window.saves.at(-1).textbookPlans), []);
    assert.equal(await page.evaluate(() => window.saves.at(-1).nextLessonPlan), "이전 원문\n  그대로 보존");
    pass("legacy raw is not parsed; zero meaningful plans and empty rows are valid");
    await mount({}); await add().click(); await field("선택 전 교재 계획").fill("선택 전 작성\n둘째 줄");
    await page.clock.fastForward(60_001);
    const pending = await page.evaluate(() => window.autosaves.at(-1).payload);
    assert.equal(pending.manualTextbookPlans[0].text, "선택 전 작성\n둘째 줄"); assert.equal(pending.textbookPlans.length, 0);
    await mount({ draft: { ...draft, payload: pending }, forceRestoreDraft: true });
    assert.equal(await field("선택 전 교재 계획").inputValue(), "선택 전 작성\n둘째 줄");
    await page.getByRole("button", { name: "임시 저장", exact: true }).first().click();
    assert.equal(await page.getByText("계획 내용을 입력한 항목의 교재를 선택해주세요.", { exact: true }).count(), 1);
    pass("pending selection content survives Draft and cannot be silently lost at Final Save");
    await selects().first().selectOption("Grammar");
    const textarea = field("Grammar 계획");
    await textarea.evaluate(el => { window.originalTextarea = el; el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
    const count = await page.evaluate(() => window.autosaves.length);
    await textarea.fill("관계대명사\n문제 풀이"); await page.clock.fastForward(60_001);
    assert.equal(await page.evaluate(() => window.autosaves.length), count);
    await textarea.evaluate(el => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    await add().click(); await selects().nth(1).selectOption("Reading");
    assert.equal(await textarea.evaluate(el => el === window.originalTextarea), true);
    await selects().first().selectOption("Bricks");
    assert.equal(await field("Bricks 계획").evaluate(el => el === window.originalTextarea), true);
    pass("IME autosave guard and textarea identity survive adding and changing textbooks");
    for (const width of [390, 507, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const row of await page.locator("[data-plan-id]").all()) {
        const box = await row.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
        const select = await row.locator("select").boundingBox(), remove = await row.locator("button").boundingBox();
        assert.ok(select.x + select.width <= remove.x + 1 || select.y + select.height <= remove.y);
      }
      await page.locator("[data-plan-id]").first().screenshot({ path: path.join(artifacts, `plan-${width}.png`) });
    }
    pass("desktop/iPad-sized/split/390px controls do not overlap");
    assert.deepEqual(errors, []);
    console.log(`${checks} manual plan browser checks passed; artifacts: ${artifacts}`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
