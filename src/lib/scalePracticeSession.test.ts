import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  clearScalePracticeHistory,
  clearScalePracticeSession,
  formatScaleTakeSubtitle,
  listScalePracticeHistory,
  parseScalePracticeSession,
  persistScalePracticeSession,
  pushScalePracticeHistory,
  readScalePracticeHistoryEntry,
  readScalePracticeSession,
  removeScalePracticeHistoryEntry,
  resetScaleProgressJourney,
} from "@/lib/scalePracticeSession";
import { listScaleProgressJourneys } from "@/lib/scaleProgressHistory";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function makeSession(
  overrides: Partial<ScalePracticeSessionV1> = {},
): ScalePracticeSessionV1 {
  const base: ScalePracticeSessionV1 = {
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
    expectedNotesMidi: [60, 62],
    audioSourceType: "uploaded",
    sampleRateHz: 48000,
    notes: [
      {
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        detectedMidi: 60,
        detectedNoteLabel: "C4",
        detectedHz: 261,
        centsDifference: 0,
        intonationBucket: "in_tune",
        missingData: false,
      },
      {
        noteIndex: 1,
        expectedMidi: 62,
        expectedNoteLabel: "D4",
        detectedMidi: 62,
        detectedNoteLabel: "D4",
        detectedHz: 293,
        centsDifference: 5,
        intonationBucket: "in_tune",
        missingData: false,
      },
    ],
    summary: {
      overallScore0to100: 90,
      averageAbsCents: 5,
      inTunePercent: 100,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: 2,
      notesMissing: 0,
    },
    scaleSource: "detected",
  };
  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...overrides.summary },
    notes: overrides.notes ?? base.notes,
    expectedNotesMidi: overrides.expectedNotesMidi ?? base.expectedNotesMidi,
  };
}

describe("scalePracticeSession history", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(`s:${k}`) ?? null,
      setItem: (k: string, v: string) => {
        store.set(`s:${k}`, v);
      },
      removeItem: (k: string) => {
        store.delete(`s:${k}`);
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(`l:${k}`) ?? null,
      setItem: (k: string, v: string) => {
        store.set(`l:${k}`, v);
      },
      removeItem: (k: string) => {
        store.delete(`l:${k}`);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects sessions whose notes do not match expected midis", () => {
    const bad = makeSession({ expectedNotesMidi: [60] });
    expect(parseScalePracticeSession(bad)).toBeNull();
  });

  it("persists current session and groups by scale journey", () => {
    const a = makeSession({ sessionId: "a", recordedAt: "2026-01-02T00:00:00.000Z" });
    persistScalePracticeSession(a);
    expect(readScalePracticeSession()?.sessionId).toBe("a");
    expect(listScalePracticeHistory()).toHaveLength(1);

    const b = makeSession({ sessionId: "b", recordedAt: "2026-01-03T00:00:00.000Z" });
    persistScalePracticeSession(b);
    const hist = listScalePracticeHistory();
    expect(hist.map((s) => s.sessionId)).toEqual(["b", "a"]);
    expect(readScalePracticeHistoryEntry("a")?.sessionId).toBe("a");
    expect(listScaleProgressJourneys()).toHaveLength(1);
    expect(listScaleProgressJourneys()[0]?.attempts).toHaveLength(2);
  });

  it("keeps separate journeys for different scales", () => {
    pushScalePracticeHistory(makeSession({ sessionId: "c", scaleId: "C_major" }));
    pushScalePracticeHistory(
      makeSession({
        sessionId: "d",
        scaleId: "D_major",
        scaleLabel: "D major",
        tonicPitchClass: 2,
      }),
    );
    expect(listScaleProgressJourneys()).toHaveLength(2);
  });

  it("dedupes by id within a journey", () => {
    pushScalePracticeHistory(makeSession({ sessionId: "id-10" }));
    pushScalePracticeHistory(makeSession({ sessionId: "id-10" }));
    expect(listScaleProgressJourneys()[0]?.attempts).toHaveLength(1);
  });

  it("removes a history entry by id", () => {
    pushScalePracticeHistory(makeSession({ sessionId: "keep" }));
    pushScalePracticeHistory(makeSession({ sessionId: "drop" }));
    removeScalePracticeHistoryEntry("drop");
    expect(listScalePracticeHistory().map((s) => s.sessionId)).toEqual(["keep"]);
  });

  it("formats take subtitle without repeating the scale name", () => {
    expect(formatScaleTakeSubtitle(makeSession())).toBe(
      "Detected · 1 octave",
    );
  });

  it("clear helpers wipe storage", () => {
    persistScalePracticeSession(makeSession());
    clearScalePracticeSession();
    clearScalePracticeHistory();
    expect(readScalePracticeSession()).toBeNull();
    expect(listScalePracticeHistory()).toHaveLength(0);
  });

  it("resetScaleProgressJourney removes that scale and its current session", () => {
    persistScalePracticeSession(makeSession({ sessionId: "c1", scaleId: "C_major" }));
    persistScalePracticeSession(
      makeSession({
        sessionId: "d1",
        scaleId: "D_major",
        scaleLabel: "D major",
        tonicPitchClass: 2,
      }),
    );
    expect(readScalePracticeSession()?.sessionId).toBe("d1");
    resetScaleProgressJourney("C_major__1");
    expect(listScaleProgressJourneys().map((j) => j.progressKey)).toEqual([
      "D_major__1",
    ]);
    expect(readScalePracticeSession()?.sessionId).toBe("d1");
    resetScaleProgressJourney("D_major__1");
    expect(listScaleProgressJourneys()).toHaveLength(0);
    expect(readScalePracticeSession()).toBeNull();
  });
});
