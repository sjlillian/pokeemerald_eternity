import { chromium } from "playwright";

const out =
  "C:/Users/Spencer/AppData/Local/Cursor/AgentStores/cursor_agent_stores/bc-4c11c800-4df7-4b16-8992-2fd8bdf357b5/files/media/porymap-studio-sidebar-resize.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:7340/", { waitUntil: "networkidle" });
await page.waitForSelector("#projectRoot");
await page.waitForTimeout(800);

const metrics = await page.evaluate(() => {
  const sidebar = document.querySelector(".sidebar");
  const project = document.querySelector("#projectRoot");
  const pory = document.querySelector("#porymapStatus");
  return {
    sidebarClientWidth: sidebar.clientWidth,
    sidebarScrollWidth: sidebar.scrollWidth,
    overflowX: getComputedStyle(sidebar).overflowX,
    projectText: project.textContent,
    projectTitle: project.title,
    poryText: pory.textContent,
    poryTitle: pory.title,
    cssVar: getComputedStyle(document.documentElement)
      .getPropertyValue("--sidebar")
      .trim(),
    hasHorizontalOverflow: sidebar.scrollWidth > sidebar.clientWidth + 1,
  };
});

const box = await page.locator("#sidebarResizer").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 40);
await page.mouse.down();
await page.mouse.move(box.x + 120, box.y + 40, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);

const after = await page.evaluate(() => ({
  cssVar: getComputedStyle(document.documentElement)
    .getPropertyValue("--sidebar")
    .trim(),
  saved: localStorage.getItem("porymapStudio.sidebarWidth"),
  hasHorizontalOverflow:
    document.querySelector(".sidebar").scrollWidth >
    document.querySelector(".sidebar").clientWidth + 1,
}));

await page.screenshot({ path: out, fullPage: false });
console.log(JSON.stringify({ metrics, after, screenshot: out }, null, 2));
await browser.close();
