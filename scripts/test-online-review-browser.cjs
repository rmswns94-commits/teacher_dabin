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
const artifacts = path.join(os.tmpdir(), "teacher-dabin-online-review");
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
    await mount({});
    const reviews = () => page.getByRole("group", { name: "온라인 복습", exact: true });
    const button = (i, name) => reviews().nth(i).getByRole("button", { name, exact: true });
    const selected = async (i, name) => (await button(i, name).getAttribute("aria-pressed")) === "true";
    const ids = await page.evaluate(() => window.defaults.students.map(s => s.studentId));
    assert.equal(await reviews().count(), 3);
    for (let i = 0; i < 3; i++) { assert.equal(await selected(i, "완료"), false); assert.equal(await selected(i, "미완료"), false); }
    await button(0, "완료").click();
    assert.equal(await selected(0, "완료"), true); assert.equal(await selected(1, "완료"), false);
    await button(0, "미완료").click();
    assert.equal(await selected(0, "완료"), false); assert.equal(await selected(0, "미완료"), true);
    await button(0, "미완료").click(); assert.equal(await selected(0, "미완료"), false);
    await button(0, "완료").focus(); await page.keyboard.press("Space"); assert.equal(await selected(0, "완료"), true);
    await button(1, "미완료").click();
    pass("null/true/false, deselection, keyboard and student isolation");
    const homework = page.getByRole("group", { name: "숙제", exact: true });
    await homework.nth(0).getByRole("button", { name: "미제출", exact: true }).click();
    await homework.nth(1).getByRole("button", { name: "완료", exact: true }).click();
    await page.clock.fastForward(60_001);
    await page.waitForFunction(() => window.autosaves.length > 0);
    const payload = await page.evaluate(() => window.autosaves.at(-1).payload);
    assert.deepEqual(ids.map(id => payload.entries[id].onlineReviewCompleted), [true, false, null]);
    assert.deepEqual(ids.map(id => payload.entries[id].homeworkStatus), ["missing", "completed", ""]);
    for (const id of ids) { assert.equal(payload.entries[id].parentNoteNeeded, false); assert.equal(payload.entries[id].needsMakeup, false); }
    pass("60-second dirty autosave retains independent homework and online review values");
    await page.reload(); await page.waitForFunction(() => Boolean(window.mount));
    assert.equal(await selected(0, "완료"), true); assert.equal(await selected(1, "미완료"), true);
    pass("Draft reload restores true and false without treating null as incomplete");
    await page.getByRole("button", { name: "수업 기록 완료", exact: true }).first().click();
    await page.getByRole("button", { name: "수업 마무리 완료", exact: true }).click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    const saved = await page.evaluate(() => ({ data: window.saves.at(-1), error: window.saveError }));
    assert.equal(saved.error, null);
    assert.deepEqual(saved.data.students.map(s => s.onlineReviewCompleted), [true, false, null]);
    assert.deepEqual(saved.data.students.map(s => s.homeworkStatus), ["missing", "completed", ""]);
    assert.equal(saved.data.tasks.length, 0); assert.equal(saved.data.homeworkAssignments.length, 0);
    pass("Final Save passes real validation, optional null, independent homework and no added tasks");
    const students = await page.evaluate((rows) => window.defaults.students.map(s => ({ ...s, entry: rows.find(r => r.studentId === s.studentId) })), saved.data.students);
    await mount({ students });
    assert.equal(await selected(0, "완료"), true); assert.equal(await selected(1, "미완료"), true);
    await button(0, "미완료").click();
    await page.getByRole("button", { name: "임시 저장", exact: true }).first().click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    const edited = await page.evaluate(() => window.saves.at(-1).students);
    assert.equal(edited[0].onlineReviewCompleted, false);
    await mount({ students: students.map(s => ({ ...s, entry: edited.find(r => r.studentId === s.studentId) })) });
    assert.equal(await selected(0, "미완료"), true);
    pass("saved entry hydration and completed-to-incomplete edit round trip");
    const draft = { id: "draft", updatedAt: new Date().toISOString(), payload };
    await mount({ group: { id: "55555555-5555-4555-8555-555555555555", name: "B" } });
    assert.equal(await selected(0, "완료"), false); assert.equal(await selected(0, "미완료"), false);
    await mount({ draft, forceRestoreDraft: true }); assert.equal(await selected(0, "완료"), true);
    await mount({ classDate: "2026-09-15" }); assert.equal(await selected(0, "완료"), false);
    pass("group A-B-A Draft restoration and new-date isolation");
    const oldPayload = structuredClone(payload);
    for (const e of Object.values(oldPayload.entries)) delete e.onlineReviewCompleted;
    await mount({ draft: { ...draft, payload: oldPayload }, forceRestoreDraft: true });
    for (let i = 0; i < 3; i++) { assert.equal(await selected(i, "완료"), false); assert.equal(await selected(i, "미완료"), false); }
    assert.equal(await homework.nth(0).getByRole("button", { name: "미제출", exact: true }).getAttribute("aria-pressed"), "true");
    pass("legacy Draft missing field stays unselected and preserves homework");
    await mount({ draft, forceRestoreDraft: true, students: [...await page.evaluate(() => window.defaults.students)].reverse() });
    assert.equal(await selected(0, "완료"), false); assert.equal(await selected(1, "미완료"), true); assert.equal(await selected(2, "완료"), true);
    pass("reordered cards restore by student_id, not index");
    await mount({ draft, forceRestoreDraft: true });
    await page.getByRole("button", { name: "결석", exact: true }).first().click();
    await page.getByRole("button", { name: "임시 저장", exact: true }).first().click();
    await page.waitForFunction(() => window.saves.length > 0 || window.saveError);
    assert.equal(await page.evaluate(() => window.saves.at(-1).students[0].onlineReviewCompleted), true);
    await page.getByRole("button", { name: "출석", exact: true }).first().click();
    assert.equal(await selected(0, "완료"), true);
    pass("attendance changes preserve online review through save and return to present");
    await mount({});
    const vocab = page.getByRole("textbox", { name: "시험학생 단어시험 맞은 개수", exact: true });
    await vocab.fill("7");
    await page.locator("textarea,input").evaluateAll(nodes => { window.originalInputs = nodes; });
    await button(0, "완료").click();
    assert.equal(await page.locator("textarea,input").evaluateAll(nodes => nodes.length === window.originalInputs.length && nodes.every((node, i) => node === window.originalInputs[i])), true);
    assert.equal(await vocab.inputValue(), "7");
    pass("all existing input and textarea DOM nodes remain mounted with values preserved");
    for (const width of [390, 507, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const group of await reviews().all()) {
        const box = await group.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width);
        const label = await group.locator("span").boundingBox();
        const complete = await group.getByRole("button", { name: "완료", exact: true }).boundingBox();
        const incomplete = await group.getByRole("button", { name: "미완료", exact: true }).boundingBox();
        assert.ok(label.x + label.width <= complete.x && complete.x + complete.width <= incomplete.x);
      }
      await reviews().first().screenshot({ path: path.join(artifacts, `online-review-${width}.png`) });
    }
    pass("390px / split / portrait / landscape / desktop labels and buttons do not overlap");
    assert.deepEqual(errors, []);
    console.log(`${checks} online review browser checks passed; artifacts: ${artifacts}`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
