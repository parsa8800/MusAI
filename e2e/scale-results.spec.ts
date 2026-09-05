import { expect, test } from "@playwright/test";

const RESULTS_URL = "/practice/scale/results";
const STORAGE_KEY = "musai-scale-practice-session-v1";

test.describe("Scale practice results", () => {
  test("no session shows empty state (after hydration)", async ({ page }) => {
    await page.addInitScript(({ key }) => {
      sessionStorage.removeItem(key);
    }, { key: STORAGE_KEY });

    await page.goto(RESULTS_URL);
    await expect(page.getByText(/No scale session found/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Scale practice/i }),
    ).toHaveAttribute("href", "/practice/scale");
  });

  test("corrupt session does not crash and shows empty state", async ({ page }) => {
    await page.addInitScript(({ key }) => {
      sessionStorage.setItem(key, "{not-json");
    }, { key: STORAGE_KEY });

    await page.goto(RESULTS_URL);
    await expect(page.getByText(/No scale session found/i)).toBeVisible();
  });

  test("valid session renders session readout", async ({ page }) => {
    await page.addInitScript(({ key }) => {
      const session = {
        schemaVersion: 1,
        sessionId: "s1",
        exerciseType: "scale_practice",
        recordedAt: "2026-01-01T00:00:00.000Z",
        scaleId: "pc0-major",
        scaleLabel: "C major",
        scaleKind: "major",
        tonicPitchClass: 0,
        octaveSpan: 1,
        octaveRangeLabel: "C4 → C5",
        rootMidi: 60,
        expectedNotesMidi: [60, 62, 64],
        audioSourceType: "uploaded",
        sampleRateHz: 48000,
        notes: [
          {
            noteIndex: 0,
            expectedMidi: 60,
            expectedNoteLabel: "C4",
            detectedMidi: 60,
            detectedNoteLabel: "C4",
            detectedHz: 261.6,
            centsDifference: 0,
            intonationBucket: "in_tune",
            missingData: false,
          },
        ],
        summary: {
          overallScore0to100: 90,
          averageAbsCents: 4.2,
          inTunePercent: 75,
          weakestNoteIndices: [],
          trend: "balanced",
          meanSignedCents: 0,
          notesAnalyzed: 1,
          notesMissing: 0,
        },
      };
      sessionStorage.setItem(key, JSON.stringify(session));
    }, { key: STORAGE_KEY });

    await page.goto(RESULTS_URL);
    await expect(page.getByRole("heading", { name: /C major/i })).toBeVisible();
    await expect(page.getByText(/On pitch/i)).toBeVisible();
    await expect(page.getByText(/Teacher feedback/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Try again/i })).toHaveAttribute(
      "href",
      "/practice/scale",
    );
  });
});

