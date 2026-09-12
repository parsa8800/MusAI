import { expect, test, type Page } from "@playwright/test";

async function assertStudioFits(page: Page) {
  await page.goto("/practice/scale");
  await expect(page.getByRole("heading", { name: "Scale studio" })).toBeVisible();
  await expect(page.getByTestId("musai-rec-anchor")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const rec = document.querySelector("[data-testid='musai-rec-anchor']");
    const wave = document.querySelector(".musai-rec-wave-well");
    const recBox = rec?.getBoundingClientRect();
    const waveBox = wave?.getBoundingClientRect();
    const doc = document.documentElement;
    return {
      vh: window.innerHeight,
      scrollH: Math.max(doc.scrollHeight, document.body.scrollHeight),
      recBottom: recBox ? recBox.bottom : -1,
      waveBottom: waveBox ? waveBox.bottom : -1,
      recVisible: recBox
        ? recBox.top >= 0 && recBox.bottom <= window.innerHeight + 1
        : false,
      waveVisible: waveBox
        ? waveBox.top >= 0 && waveBox.bottom <= window.innerHeight + 1
        : false,
    };
  });

  expect(metrics.scrollH, "page should not be taller than the viewport").toBeLessThanOrEqual(
    metrics.vh + 2,
  );
  expect(metrics.recVisible).toBe(true);
  expect(metrics.waveVisible).toBe(true);
}

async function notationFitMetrics(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector("[data-testid='scale-notation-frame']");
    if (!frame) return { ok: false, svgCount: 0, overflow: ["no-frame"] };
    const frameBox = frame.getBoundingClientRect();
    const svgs = [...frame.querySelectorAll("svg")];
    const pad = 2;
    const overflow: string[] = [];
    for (const svg of svgs) {
      const box = svg.getBoundingClientRect();
      if (box.left < frameBox.left - pad) overflow.push("svg-left");
      if (box.right > frameBox.right + pad) overflow.push("svg-right");
      if (box.top < frameBox.top - pad) overflow.push("svg-top");
      if (box.bottom > frameBox.bottom + pad) overflow.push("svg-bottom");
    }
    const marks = frame.querySelectorAll(
      "svg, svg path, svg line, svg ellipse, svg use",
    );
    for (const mark of marks) {
      const box = mark.getBoundingClientRect();
      if (box.width + box.height < 0.25) continue;
      if (box.left < frameBox.left - pad) overflow.push("ink-left");
      if (box.right > frameBox.right + pad) overflow.push("ink-right");
      if (box.top < frameBox.top - pad) overflow.push("ink-top");
      if (box.bottom > frameBox.bottom + pad) overflow.push("ink-bottom");
    }
    return {
      ok: overflow.length === 0 && svgs.length > 0,
      svgCount: svgs.length,
      overflow: [...new Set(overflow)],
    };
  });
}

test.describe("Scale Studio viewport fit", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`${viewport.width}x${viewport.height} shows record + waveform without scrolling`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await assertStudioFits(page);
    });
  }

  test("Just play draft notation stays inside the staff frame", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/practice/scale");
    await page.getByRole("tab", { name: "Just play" }).click();
    await expect(page.getByTestId("scale-notation-frame")).toBeVisible();
    await expect
      .poll(async () => notationFitMetrics(page), { timeout: 8_000 })
      .toMatchObject({ ok: true });
  });

  test("2-octave up/down notation stays inside the staff frame", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/practice/scale");
    await page.getByRole("tab", { name: "Pick notes" }).click();
    await page.getByRole("tab", { name: "2 oct" }).click();
    await page.getByRole("tab", { name: "Up/down" }).click();

    await expect(page.getByTestId("scale-notation-frame")).toBeVisible();
    await expect(page.locator(".musai-scale-staff-heading__title")).toHaveCount(0);
    await expect
      .poll(async () => notationFitMetrics(page), { timeout: 8_000 })
      .toMatchObject({ ok: true });

    const fitted = await notationFitMetrics(page);
    expect(fitted.svgCount).toBeGreaterThan(0);
    expect(fitted.overflow, "staff ink should not be clipped").toEqual([]);
    const frameHeight = await page
      .getByTestId("scale-notation-frame")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(frameHeight, "pick-notes staff should keep most of the column").toBeGreaterThan(
      200,
    );
  });

  test("Pick notes 1-octave on a short laptop stays inside the staff frame", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await page.goto("/practice/scale");
    await page.getByRole("tab", { name: "Pick notes" }).click();
    await expect(page.getByTestId("scale-notation-frame")).toBeVisible();
    await expect(page.locator(".musai-scale-staff-heading__title")).toHaveCount(0);
    await expect(page.getByText(/1 octave ·/)).toHaveCount(0);
    await expect
      .poll(async () => notationFitMetrics(page), { timeout: 8_000 })
      .toMatchObject({ ok: true });
    const frameHeight = await page
      .getByTestId("scale-notation-frame")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(frameHeight, "pick-notes staff should keep most of the column").toBeGreaterThan(
      200,
    );
  });
});
