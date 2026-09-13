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
const artifacts = path.join(os.tmpdir(), "teacher-dabin-manual-progress");
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
 students, textbooks:['Grammar','Reading','Bricks'], examPeriod:true,examTargetSchools:['한울중'],schools:['한울중','가산중']};
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
    const add = () => page.getByRole("button", { name: "교재 진도 추가", exact: true });
    const selects = () => page.getByRole("combobox", { name: "일반 진도 교재 선택" });
    await mount({ examPeriod: false });
    assert.equal(await add().count(), 0);
    for (const book of ["Grammar", "Reading", "Bricks"]) assert.equal(await page.getByRole("textbox", { name: `${book} 진도`, exact: true }).count(), 1);
    pass("OFF retains all automatic textbook fields and no add button");
    await mount({ examTargetSchools: null });
    assert.equal(await add().count(), 0);
    assert.equal(await page.getByRole("textbox", { name: "가산중 진도", exact: true }).count(), 1);
    pass("legacy exam retains school-only editor");
    await mount({});
    assert.equal(await selects().count(), 0);
    assert.equal(await page.getByRole("textbox", { name: "한울중 진도", exact: true }).count(), 1);
    assert.equal(await page.getByRole("textbox", { name: "가산중 진도", exact: true }).count(), 0);
    pass("mixed initial: target school automatic, zero textbook rows");
    await add().click(); await selects().nth(0).selectOption("Grammar");
    const rawText = "  관계대명사 목적격\n문제 풀이  ";
    await page.getByRole("textbox", { name: "Grammar 진도", exact: true }).fill(rawText);
    const firstId = await page.locator("[data-progress-id]").first().getAttribute("data-progress-id");
    await add().click();
    assert.equal(await selects().nth(1).locator('option[value="Grammar"]').evaluate((option) => option.disabled), true,
      JSON.stringify(await selects().evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, html: node.outerHTML })))));
    await selects().nth(1).selectOption("Reading");
    await page.getByRole("textbox", { name: "Reading 진도", exact: true }).fill("독해 B");
    assert.equal(await page.getByRole("textbox", { name: "Bricks 진도", exact: true }).count(), 0);
    assert.equal(await selects().nth(0).locator("option").allTextContents().then((xs) => xs.includes("백발백중")), false);
    pass("multiple manual rows, duplicate options disabled, unused/exam-prep books absent");
    await page.getByRole("textbox", { name: "한울중 진도", exact: true }).fill("학교 A");
    await page.getByRole("button", { name: "전체 학생에게 적용", exact: true }).click();
    // Existing student textareas may be in a collapsed detail: inspect Final Save payload below.
    await page.clock.fastForward(60_001);
    await page.waitForFunction(() => window.autosaves.length > 0);
    const saved = await page.evaluate(() => window.autosaves.at(-1));
    assert.equal(saved.payload.manualTextbookProgress[0].id, firstId);
    assert.equal(saved.payload.manualTextbookProgress[0].text, rawText);
    assert.equal(saved.payload.textbookProgress[0].text, rawText);
    assert.equal(saved.payload.entries["11111111-1111-4111-8111-111111111111"].progress, "한울중 - 학교 A");
    for (const id of ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]) {
      assert.ok(saved.payload.entries[id].progress.includes("Grammar")); assert.ok(!saved.payload.entries[id].progress.includes("학교 A"));
    }
    pass("60-second autosave preserves IDs/raw multiline and school/regular apply scopes");
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mount));
    assert.equal(await page.locator("[data-progress-id]").first().getAttribute("data-progress-id"), firstId);
    assert.equal(await page.getByRole("textbox", { name: "Grammar 진도", exact: true }).inputValue(), rawText);
    pass("browser reload restores manual item IDs and multiline Draft content");
    const draft = { id: "draft", updatedAt: new Date().toISOString(), payload: saved.payload };
    await mount({ group: { id: "55555555-5555-4555-8555-555555555555", name: "B" } });
    assert.equal(await selects().count(), 0);
    await mount({ draft, forceRestoreDraft: true });
    assert.equal(await selects().count(), 2);
    assert.equal(await page.locator("[data-progress-id]").first().getAttribute("data-progress-id"), firstId);
    pass("A to B to A draft restoration isolates groups and retains stable IDs");
    await page.getByRole("button", { name: "Grammar 진도 삭제", exact: true }).click();
    assert.equal(await selects().count(), 1);
    assert.equal(await page.getByRole("textbox", { name: "Reading 진도", exact: true }).inputValue(), "독해 B");
    assert.equal(await page.getByRole("textbox", { name: "한울중 진도", exact: true }).inputValue(), "학교 A");
    pass("delete only removes the chosen textbook row");
    await page.getByRole("button", { name: "수업 기록 완료", exact: true }).first().click();
    await page.getByRole("button", { name: "수업 마무리 완료", exact: true }).click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    const final = await page.evaluate(() => ({ data: window.saves.at(-1), error: window.saveError }));
    assert.equal(final.error, null);
    assert.deepEqual(final.data.textbookProgress, [{ name: "Reading", text: "독해 B" }]);
    assert.deepEqual(final.data.schoolProgress, [{ name: "한울중", text: "학교 A" }]);
    assert.equal(final.data.homeworkAssignments.length, 0); assert.equal(final.data.tasks.length, 0);
    assert.ok(await page.evaluate((input) => window.excel({ school: input.schoolProgress, textbook: input.textbookProgress, raw: input.defaultProgress }).includes("Reading - 독해 B"), final.data));
    pass("Final Save passes existing schema with unchanged structured format and no homework/task data");
    const legacy = { textbookProgress: [{ name: "Removed Book", text: "기존 진도" }, { name: "Grammar", text: "기존 문법" }] };
    await mount({ draft: { id: "old", updatedAt: new Date().toISOString(), payload: legacy }, forceRestoreDraft: true, currentHomeworkStudents: [] });
    assert.equal(await selects().count(), 2); assert.equal(await add().count(), 0);
    assert.equal(await page.getByRole("textbox", { name: "Removed Book 진도", exact: true }).inputValue(), "기존 진도");
    pass("legacy Draft and removed textbooks survive zero current regular students");
    await mount({ initial: legacy, currentHomeworkStudents: [] });
    assert.equal(await selects().count(), 2);
    pass("Finalized edit hydrates historical textbooks without current membership");
    await mount({ currentHomeworkStudents: [] }); assert.equal(await add().count(), 0); assert.equal(await selects().count(), 0);
    await mount({ textbooks: [] }); assert.equal(await add().isDisabled(), true);
    assert.equal(await page.locator("#progress").getByText("등록된 일반 교재가 없어요.", { exact: false }).count(), 1);
    pass("zero regular students hidden; zero regular textbooks explicit disabled state");
    await mount({}); await add().click(); await selects().first().selectOption("Grammar"); await add().click();
    await page.getByRole("button", { name: "임시 저장", exact: true }).first().click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    assert.deepEqual(await page.evaluate(() => window.saves.at(-1).textbookProgress), []);
    pass("zero meaningful textbook progress is valid; empty selected and pending rows are omitted");
    await mount({}); await add().click();
    await page.getByRole("textbox", { name: "선택 전 교재 진도", exact: true }).fill("선택 전 입력");
    await page.clock.fastForward(60_001);
    const pending = await page.evaluate(() => window.autosaves.at(-1).payload);
    assert.equal(pending.manualTextbookProgress[0].text, "선택 전 입력");
    assert.equal(pending.textbookProgress.length, 0);
    await mount({ draft: { id: "pending", updatedAt: new Date().toISOString(), payload: pending }, forceRestoreDraft: true });
    assert.equal(await page.getByRole("textbox", { name: "선택 전 교재 진도", exact: true }).inputValue(), "선택 전 입력");
    await page.getByRole("button", { name: "임시 저장", exact: true }).first().click();
    assert.equal(await page.getByText("진도 내용을 입력한 항목의 교재를 선택해주세요.", { exact: true }).count(), 1);
    pass("pending content survives Draft and cannot be silently discarded by Final Save");
    await selects().first().selectOption("Grammar");
    const textarea = page.getByRole("textbox", { name: "Grammar 진도", exact: true });
    await textarea.evaluate((el) => { window.originalTextarea = el; el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
    const autosaveCount = await page.evaluate(() => window.autosaves.length);
    await textarea.fill("관계대명사 목적격 문제 풀이\n두 번째 줄");
    await page.clock.fastForward(60_001);
    assert.equal(await page.evaluate(() => window.autosaves.length), autosaveCount);
    await textarea.evaluate((el) => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    await add().click(); await selects().nth(1).selectOption("Reading");
    assert.equal(await textarea.evaluate((el) => el === window.originalTextarea), true);
    pass("composition guard and stable textarea identity survive option recalculation / adding another row");
    for (const width of [390, 507, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      const box = await page.locator("#progress").boundingBox();
      const rows = await page.locator("[data-progress-id]").all();
      for (const row of rows) {
        const rowBox = await row.boundingBox(); assert.ok(rowBox.x >= box.x && rowBox.x + rowBox.width <= box.x + box.width + 1);
        const selectBox = await row.locator("select").boundingBox(); const deleteBox = await row.locator("button").boundingBox();
        assert.ok(selectBox.x + selectBox.width <= deleteBox.x + 1 || selectBox.y + selectBox.height <= deleteBox.y);
      }
      await page.locator("#progress").screenshot({ path: path.join(artifacts, `progress-${width}.png`) });
    }
    pass("390px / Split View / portrait / landscape / desktop controls do not overlap");
    assert.deepEqual(errors, []);
    console.log(`${checks} manual progress browser checks passed; artifacts: ${artifacts}`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
