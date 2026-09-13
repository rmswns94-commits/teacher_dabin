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
const artifacts = path.join(os.tmpdir(), "teacher-dabin-homework-carry");
const stubs = {
  "next/link": `import React from 'react'; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }`,
  "next/navigation": `export const useRouter=()=>({refresh:()=>{},back:()=>{},push:()=>{}});export const usePathname=()=>'/todos';`,
  "@/components/app-shell": `export const AppShell=({children})=>children;`,
  "@/components/today-refresher": `export const TodayRefresher=()=>null;`,
  "@/components/todo-create-dialog": `export const TodoCreateDialog=()=>null;`,
  "@/components/todo-delete-button": `export const TodoDeleteButton=()=>null;`,
  "@/app/groups/actions": `export const togglePreparationItemAction=async()=>{window.todoCalls++;};`,
  "@/app/daily-logs/actions": `export async function toggleHomeworkCompletionAction(id) {
    window.calls.push(id); await new Promise(resolve=>window.release=resolve);
    if(window.fail) return;
    const row=window.rows.find(r=>r.id===id); row.completed=!row.completed;
    row.completedAt=row.completed?window.today+'T12:00:00+09:00':null;
    await window.mount(window.today);
  }`,
  "@/lib/dates": `export const todayDateString=()=>window.today;
    export const formatShortMonthDay=s=>s.split('-').slice(1).map(Number).join('/');
    export const formatKoreanDate=s=>s;`,
  "@/lib/supabase/queries/daily-logs": `export const getDueHomeworkForCurrentUser=async()=>structuredClone(window.rows);`,
  "@/lib/supabase/queries/groups": `export const getCurrentUserGroups=async()=>[{id:'group',name:'A반',archived:false,preparation_items:[{id:'todo-1',text:'기존 Todo',completed:false,dueDate:'2026-09-12'}]}];`,
  "@/lib/supabase/queries/schedules": `export const getCurrentUserSchedulesWithGroup=async()=>[];`,
};
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import Page from './app/todos/page';
window.today='2026-09-14';window.calls=[];window.todoCalls=0;window.fail=false;
window.rows=[
 {id:'a',dueDate:'2026-09-12',content:'숙제A\\n공통 문법 복습',textbook:'Grammar',school:null,assignedStudentName:null,completed:false,completedAt:null},
 {id:'b',dueDate:'2026-09-13',content:'숙제B\\n서술형 3문제',school:'한울중',textbook:null,assignedStudentName:'김민지',completed:false,completedAt:null},
 {id:'c',dueDate:'2026-09-14',content:'숙제C',textbook:'Reading',completed:false,completedAt:null},
 {id:'d',dueDate:'2026-09-12',content:'과거완료D',completed:true,completedAt:'2026-09-13T12:00:00+09:00'},
 {id:'e',dueDate:'2026-09-20',content:'미래숙제E',completed:false,completedAt:null},
 {id:'f',dueDate:null,content:'무날짜F',completed:false,completedAt:null},
].map((r,i)=>({...r,groupId:'group',dailyLogId:'log',sortOrder:i}));
const app=createRoot(document.getElementById('app'));
window.mount=async(date=window.today)=>{const node=await Page({searchParams:Promise.resolve({date,month:date.slice(0,7)})});flushSync(()=>app.render(node));};
window.mount();
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

    const item = name => page.getByRole("button", { name: new RegExp(name) });
    assert.equal(await item("숙제A").count(), 1); assert.equal(await item("숙제B").count(), 1);
    assert.equal(await item("숙제C").count(), 1); assert.equal(await item("과거완료D").count(), 0);
    assert.equal(await item("미래숙제E").count(), 0); assert.equal(await item("무날짜F").count(), 0);
    assert.ok((await item("숙제A").innerText()).includes("9/12 마감"));
    assert.ok((await item("숙제B").innerText()).includes("김민지"));
    assert.ok((await item("숙제B").innerText()).includes("한울중"));
    assert.equal(await page.getByRole("link", { name: "2026-09-14 할 일 1개", exact: true }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "2026-09-12 할 일 3개", exact: true }).count(), 1);
    pass("today due and overdue appear with original date, audience and saved context");
    await item("숙제A").click();
    await page.waitForFunction(()=>Boolean(window.release));
    assert.equal(await item("숙제A").isDisabled(), true);
    await item("숙제A").evaluate(el=>el.click());
    assert.equal(await page.evaluate(()=>window.calls.length), 1);
    await page.evaluate(()=>window.release());
    await page.waitForFunction(()=>window.rows[0].completed);
    assert.equal(await item("숙제A").getAttribute("aria-pressed"), "true");
    assert.equal(await item("숙제B").getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(()=>window.todoCalls), 0);
    assert.equal(await page.evaluate(()=>window.rows[0].dueDate), "2026-09-12");
    assert.ok((await page.locator("body").innerText()).includes("숙제 1/3"));
    assert.equal(await page.getByRole("link", { name: "2026-09-14 할 일 1개", exact: true }).count(), 1);
    pass("completion remains checked without reload, separate counts update, duplicate submit blocked");
    await item("숙제A").click(); await page.waitForFunction(()=>window.calls.length===2);
    await page.evaluate(()=>window.release());
    await page.waitForFunction(()=>!window.rows[0].completed);
    assert.equal(await item("숙제A").getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(()=>window.rows[0].completedAt), null);
    await page.evaluate(()=>window.fail=true);
    await item("숙제A").click(); await page.waitForFunction(()=>window.calls.length===3);
    await page.evaluate(()=>window.release());
    await page.waitForFunction(()=>document.querySelector('button[aria-busy="true"]')===null);
    assert.equal(await item("숙제A").getAttribute("aria-pressed"), "false");
    await page.evaluate(()=>window.fail=false);
    pass("restore and failed action retain actual state without optimistic data loss");
    await page.evaluate(()=>window.mount('2026-09-13'));
    assert.equal(await item("숙제A").count(), 0); assert.equal(await item("숙제B").count(), 1);
    await page.evaluate(()=>window.mount('2026-09-20'));
    assert.equal(await item("숙제A").count(), 0); assert.equal(await item("미래숙제E").count(), 1);
    await page.evaluate(()=>{window.rows[0].completed=true;window.rows[0].completedAt='2026-09-14T14:59:00Z';window.today='2026-09-15';return window.mount();});
    assert.equal(await item("숙제A").count(), 0); assert.equal(await item("숙제B").count(), 1);
    await page.evaluate(()=>window.mount('2026-09-12'));
    assert.equal(await item("숙제A").getAttribute("aria-pressed"), "true");
    pass("next-day removal and exact original-date history/future preview");
    await page.evaluate(()=>{window.today='2026-09-14';return window.mount();});
    for (const width of [390, 507, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 1000 });
      const row = item("숙제A"), box = await row.boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width);
      const text = await row.locator("span").last().boundingBox();
      assert.ok(text.x+text.width <= box.x+box.width);
      await row.screenshot({path:path.join(artifacts,`homework-${width}.png`)});
    }
    pass("390px/split/iPad-sized/desktop overdue metadata fits checkbox and content");
    assert.deepEqual(errors, []);
    console.log(`${checks} homework carry browser checks passed; artifacts: ${artifacts}`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
