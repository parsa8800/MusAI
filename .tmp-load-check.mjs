import { chromium } from "playwright";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

const piece = {
  schemaVersion: 1,
  pieceId: "load-check",
  slug: "load-check",
  title: "Load Check",
  composer: "Test",
  sourceKind: "musicxml",
  sourceFileName: "load-check.musicxml",
  sourceMimeType: "application/xml",
  importedAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
  lastView: "score",
  score: {
    schemaVersion: 1,
    format: "musicxml",
    title: "Load Check",
    composer: "Test",
    keySignature: "C major",
    timeSignature: "4/4",
    tempoBpm: 80,
    measureCount: 1,
    hasStructuredScore: true,
    noteCount: 4,
    restCount: 0,
  },
  attempts: [],
  progressPercent: 0,
  hasOriginalFile: false,
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.addInitScript(() => {
  localStorage.setItem("musai-theme", "dark");
});

try {
  await page.goto("http://127.0.0.1:3000/practice/scale", { waitUntil: "commit" });
  await page.locator(".musai-studio-reveal").waitFor({ timeout: 8000 });
  const cover = await page.locator(".musai-studio-reveal").evaluate((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      position: s.position,
      zIndex: s.zIndex,
      w: Math.round(box.width),
      h: Math.round(box.height),
      text: el.innerText.replace(/\s+/g, " ").trim(),
      bars: el.querySelectorAll("[role=progressbar]").length,
      tracks: el.querySelectorAll(".musai-load__track,.musai-load__fill").length,
    };
  });
  const duration = await page
    .locator(".musai-studio-reveal .musai-piece-load__dot")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  await page.screenshot({ path: "/tmp/studio-load.png" });
  await page.getByRole("heading", { name: "Play a scale" }).waitFor({ timeout: 8000 });

  await page.evaluate(async ({ piece, xml }) => {
    localStorage.setItem("musai-piece-catalog-v1", JSON.stringify([piece]));
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("musai-piece-files-v1", 6);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ["files", "scores", "musicxml", "recordings", "feedback"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("musicxml", "readwrite");
        tx.objectStore("musicxml").put(xml, piece.pieceId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { piece, xml: XML });

  await page.goto("http://127.0.0.1:3000/practice/piece/load-check", {
    waitUntil: "commit",
  });
  const opening = page.getByTestId("piece-workspace-opening");
  await opening.waitFor({ timeout: 8000 });
  const open = await opening.evaluate((el) => ({
    text: el.innerText.replace(/\s+/g, " ").trim(),
    now: el.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow") ?? null,
    tracks: el.querySelectorAll(".musai-load__track,.musai-load__fill").length,
  }));
  await page.screenshot({ path: "/tmp/piece-open-load.png" });
  await page.getByRole("heading", { name: "Load Check" }).waitFor({ timeout: 8000 });

  const report = { cover, duration, open };
  console.log(JSON.stringify(report, null, 2));
  if (
    cover.position !== "fixed" ||
    Number(cover.zIndex) < 100 ||
    cover.w < 1000 ||
    cover.h < 700 ||
    cover.bars !== 0 ||
    cover.tracks !== 0 ||
    !cover.text.includes("Opening Scale studio") ||
    duration !== "4.8s" ||
    open.tracks !== 0 ||
    !open.text.includes("%") ||
    open.now == null
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
