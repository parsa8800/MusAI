import { chromium } from "playwright";

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.goto("http://127.0.0.1:3000/practice/scale", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Play a scale" }).waitFor();

  const closed = await page.evaluate(() => {
    const frame = document.querySelector(".musai-notes-draft-frame");
    const strip = document.querySelector(".musai-capture-strip--studio");
    const panel = document.querySelector(".musai-studio-notes-panel");
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const stripStyle = strip ? getComputedStyle(strip) : null;
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const shell = document.querySelector(".fixed.inset-0");
    return {
      tips: !!document.querySelector("h2") && [...document.querySelectorAll("h2")].some((el) => el.textContent === "Tips"),
      justPlay: !!document.body.innerText.match(/Just play/),
      playScale: !!document.body.innerText.match(/Play a scale/),
      record: !!document.body.innerText.match(/Record/),
      import: !!document.body.innerText.match(/Import/),
      frameBorder: frameStyle?.borderTopWidth,
      frameStyle: frameStyle?.borderTopStyle,
      panelBorder: panelStyle?.borderTopWidth,
      stripBorder: stripStyle?.borderTopWidth,
      stripBorderStyle: stripStyle?.borderTopStyle,
      shellScroll: shell ? shell.scrollHeight - shell.clientHeight : null,
    };
  });

  const recordClosed = await page.getByRole("button", { name: /Record take/i }).boundingBox();
  const tab = page.getByRole("button", { name: /open coach/i });
  const tabBox = await tab.boundingBox();
  await tab.click();
  await page.getByRole("heading", { name: "Tips" }).waitFor();
  const recordOpen = await page.getByRole("button", { name: /Record take/i }).boundingBox();
  const drawer = await page.locator(".musai-scale-coach-drawer").boundingBox();
  const closeTab = await page.getByRole("button", { name: /close coach/i }).boundingBox();
  await page.getByRole("button", { name: /close coach/i }).click();
  const tipsAfter = await page.getByRole("heading", { name: "Tips" }).count();

  const report = {
    closed,
    tabBox,
    recordClosed,
    recordOpen,
    drawer,
    closeTab,
    recordCoveredClosed: overlaps(tabBox, recordClosed),
    recordCoveredOpen: overlaps(drawer, recordOpen) || overlaps(closeTab, recordOpen),
    tipsAfter,
  };
  console.log(JSON.stringify(report, null, 2));
  if (
    closed.tips ||
    !closed.justPlay ||
    !closed.playScale ||
    closed.frameBorder !== "0px" ||
    closed.panelBorder !== "0px" ||
    closed.shellScroll > 1 ||
    report.recordCoveredClosed ||
    report.recordCoveredOpen ||
    tipsAfter !== 0 ||
    !recordOpen
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
