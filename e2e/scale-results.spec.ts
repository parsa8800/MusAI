import { expect, test } from "@playwright/test";

const RESULTS_URL = "/practice/scale/results";
const STORAGE_KEY = "musai-scale-practice-session-v1";

test.describe("Scale practice results", () => {
  test("no session returns to Scale studio", async ({ page }) => {
    await page.addInitScript(({ key }) => {
      sessionStorage.removeItem(key);
    }, { key: STORAGE_KEY });

    await page.goto(RESULTS_URL);
    await expect(page).toHaveURL(/\/practice\/scale\/?$/);
  });

  test("corrupt session does not crash and returns to studio", async ({ page }) => {
    await page.addInitScript(({ key }) => {
      sessionStorage.setItem(key, "{not-json");
    }, { key: STORAGE_KEY });

    await page.goto(RESULTS_URL);
    await expect(page).toHaveURL(/\/practice\/scale\/?$/);
  });

  test("valid session opens the scale page instead of a separate results view", async ({
    page,
  }) => {
    await page.addInitScript(({ key }) => {
      const session = {
        schemaVersion: 1,
        sessionId: "s1",
        exerciseType: "scale_practice",
        recordedAt: "2026-01-01T00:00:00.000Z",
        scaleId: "C_major",
        scaleLabel: "C major",
        scaleKind: "major",
        tonicPitchClass: 0,
        octaveSpan: 1,
        octaveRangeLabel: "C4 → C5",
        rootMidi: 60,
        expectedNotesMidi: [60],
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
    await expect(page).toHaveURL(/\/practice\/scale\/c-major-1oct/);
    await expect(page.getByRole("heading", { name: /C major/i }).first()).toBeVisible();
  });

  test("results staff is the feedback, without side text lists", async ({ page }) => {
    const up = [60, 62, 64, 65, 67, 69, 71, 72];
    const midis = [...up, ...up.slice(0, -1).reverse()];
    const note = (
      index: number,
      midi: number,
      label: string,
      bucket: "in_tune" | "sharp" | "flat",
    ) => ({
      noteIndex: index,
      expectedMidi: midi,
      expectedNoteLabel: label,
      detectedMidi: midi,
      detectedNoteLabel: label,
      detectedHz: 261.6,
      centsDifference: bucket === "in_tune" ? 0 : bucket === "sharp" ? 28 : -24,
      intonationBucket: bucket,
      missingData: false,
    });
    const labels = [
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
      "B4",
      "A4",
      "G4",
      "F4",
      "E4",
      "D4",
      "C4",
    ];
    const firstNotes = midis.map((midi, i) =>
      note(i, midi, labels[i]!, i === 1 ? "sharp" : "in_tune"),
    );
    const secondNotes = midis.map((midi, i) =>
      note(i, midi, labels[i]!, i === 1 ? "in_tune" : i === 5 ? "sharp" : "in_tune"),
    );
    const session = (
      id: string,
      notes: ReturnType<typeof note>[],
      inTunePercent: number,
    ) => ({
      schemaVersion: 1,
      sessionId: id,
      exerciseType: "scale_practice",
      recordedAt: "2026-01-01T00:00:00.000Z",
      scaleId: "C_major",
      scaleLabel: "C major",
      scaleKind: "major",
      tonicPitchClass: 0,
      octaveSpan: 1,
      octaveRangeLabel: "C4 → C5",
      rootMidi: 60,
      expectedNotesMidi: midis,
      audioSourceType: "uploaded",
      sampleRateHz: 48000,
      notes,
      summary: {
        overallScore0to100: inTunePercent,
        averageAbsCents: 8,
        inTunePercent,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: notes.length,
        notesMissing: 0,
      },
    });
    const take1 = {
      ...session("take-1", firstNotes, 40),
      masteryPercentAfterTake: 40,
    };
    const take2 = {
      ...session("take-2", secondNotes, 80),
      masteryPercentAfterTake: 80,
    };

    await page.addInitScript(
      ({ sessionKey, progressKey, take1, take2 }) => {
        sessionStorage.setItem(sessionKey, JSON.stringify(take2));
        localStorage.setItem(
          progressKey,
          JSON.stringify([
            {
              schemaVersion: 1,
              progressKey: "C_major__1",
              scaleId: "C_major",
              scaleLabel: "C major",
              scaleKind: "major",
              tonicPitchClass: 0,
              attempts: [take1, take2],
              bestInTunePercent: 80,
              lastPractisedAt: take2.recordedAt,
              lastOctaveSpan: 1,
              lastRootMidi: 60,
              lastOctaveRangeLabel: "C4 → C5",
            },
          ]),
        );
      },
      {
        sessionKey: STORAGE_KEY,
        progressKey: "musai-scale-progress-v1",
        take1,
        take2,
      },
    );

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/practice/scale/c-major-1oct");
    await expect(page.getByRole("heading", { name: /C major/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Take history/i })).toBeVisible();
    await expect(page.getByRole("tablist", { name: /Take history/i })).toHaveCount(0);
    const notes = page.getByRole("region", { name: "Colour-coded note feedback" });
    await expect(page.getByTestId("scale-notation-frame")).toBeVisible();
    await expect(notes.getByText("A is too high")).toHaveCount(0);
    await expect(notes.getByText("New issue")).toHaveCount(0);
    await expect(notes.getByText("D is now in tune")).toHaveCount(0);
    await expect(notes.getByText("Still needs work")).toHaveCount(0);
    await expect(page.getByLabel("What changed this take")).toHaveCount(0);

    await page.getByRole("button", { name: /Take history/i }).click();
    await page.getByRole("option", { name: /^Take 1$/ }).click();
    await expect(page.getByText(/^Take 1$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Back to latest take/i })).toBeVisible();
    await expect(page.getByText("This take", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: /Progress at this take/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Back to latest take/i }).click();
    await expect(page.getByRole("button", { name: /Back to latest take/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Take history/i })).toBeVisible();
    await expect(page.getByText("This take", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("progressbar", { name: "Progress" })).toBeVisible();

    await page.getByRole("button", { name: /Switch scale/i }).click();
    await expect(page.getByRole("heading", { name: "Switch scale" })).toBeVisible();
    await expect(
      page.getByText("Scales you’ve already practised. Tap one to keep going."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /More actions for C major/i })).toBeVisible();
    await page.getByRole("button", { name: /More actions for C major/i }).click();
    await expect(page.getByRole("menuitem", { name: "Reset scale" })).toBeVisible();
  });
});
