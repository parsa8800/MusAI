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
  SCALE_HISTORY_MAX,
} from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function makeSession(
  overrides: Partial<ScalePracticeSessionV1> = {},
): ScalePracticeSessionV1 {
  return {
    schemaVersion: 1,
    sessionId: overrides.sessionId ?? "s1",
    exerciseType: "scale_practice",
    recordedAt: overrides.recordedAt ?? "2026-01-01T00:00:00.000Z",
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
    ...overrides,
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

  it("persists current session and appends history", () => {
    const a = makeSession({ sessionId: "a", recordedAt: "2026-01-02T00:00:00.000Z" });
    persistScalePracticeSession(a);
    expect(readScalePracticeSession()?.sessionId).toBe("a");
    expect(listScalePracticeHistory()).toHaveLength(1);

    const b = makeSession({ sessionId: "b", recordedAt: "2026-01-03T00:00:00.000Z" });
    persistScalePracticeSession(b);
    const hist = listScalePracticeHistory();
    expect(hist.map((s) => s.sessionId)).toEqual(["b", "a"]);
    expect(readScalePracticeHistoryEntry("a")?.sessionId).toBe("a");
  });

  it("caps history length and dedupes by id", () => {
    for (let i = 0; i < SCALE_HISTORY_MAX + 3; i++) {
      pushScalePracticeHistory(
        makeSession({ sessionId: `id-${i}`, recordedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }),
      );
    }
    expect(listScalePracticeHistory()).toHaveLength(SCALE_HISTORY_MAX);
    pushScalePracticeHistory(makeSession({ sessionId: "id-10" }));
    expect(listScalePracticeHistory()[0]?.sessionId).toBe("id-10");
    expect(listScalePracticeHistory().filter((s) => s.sessionId === "id-10")).toHaveLength(1);
  });

  it("removes a history entry by id", () => {
    pushScalePracticeHistory(makeSession({ sessionId: "keep" }));
    pushScalePracticeHistory(makeSession({ sessionId: "drop" }));
    removeScalePracticeHistoryEntry("drop");
    expect(listScalePracticeHistory().map((s) => s.sessionId)).toEqual(["keep"]);
  });

  it("formats heard-from-take subtitle for results", () => {
    expect(formatScaleTakeSubtitle(makeSession())).toBe(
      "Heard from your take · C major · 1 octave",
    );
  });

  it("clear helpers wipe storage", () => {
    persistScalePracticeSession(makeSession());
    clearScalePracticeSession();
    clearScalePracticeHistory();
    expect(readScalePracticeSession()).toBeNull();
    expect(listScalePracticeHistory()).toHaveLength(0);
  });
});
