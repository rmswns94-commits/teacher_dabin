/* eslint-disable @typescript-eslint/no-require-imports -- Optional local browser harness, independent of application dependencies. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const dir = process.env.PHASE4_ARTIFACT_DIR || path.join(os.tmpdir(), "teacher-dabin-phase4-artifacts");
const playwrightPath = process.env.PHASE4_PLAYWRIGHT_PATH || path.join(os.tmpdir(), "teacher-dabin-phase4-browser/node_modules/playwright");
const { chromium } = require(playwrightPath);

async function main() {
  assert.ok(fs.existsSync(path.join(dir, "display.html")), "Run test-phase4.cjs with PHASE4_ARTIFACT_DIR first, after a production build.");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 507, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(pathToFileURL(path.join(dir, "display.html")).href);
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(overflow, false, `horizontal overflow at ${width}, dark=${dark}`);
        const boxes = [];
        for (const title of ["준비할 일", "오늘 진도", "지난 숙제"]) {
          boxes.push(await page.locator("#briefing .section-title").filter({ hasText: new RegExp(`^.*${title}$`) }).locator("..").boundingBox());
        }
        assert.ok(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y);
        assert.ok(boxes.every((box) => Math.abs(box.width - boxes[0].width) < 1 && Math.abs(box.x - boxes[0].x) < 1));
        for (let i = 0; i < 12; i++) {
          assert.equal(await page.locator("#briefing").getByText(`숙제내용${i}끝`, { exact: false }).count(), 1);
        }
        assert.equal(await page.locator("#briefing button").count(), 0);
        const labels = await page.locator("#briefing .caption-text.font-semibold").allTextContents();
        assert.ok(labels.includes("시험 대비") && labels.includes("일반 수업"));
        await page.screenshot({ path: path.join(dir, `display-${width}-${dark ? "dark" : "light"}.png`), fullPage: true });
        console.log(`PASS browser ${width}px ${dark ? "dark" : "light"}: stacked full-width, no overflow, 12 homework entries`);
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
