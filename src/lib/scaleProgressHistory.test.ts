import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  buildJourneyFromAttempts,
  clearScaleProgressHistory,
  formatLastPractised,
  groupSessionsIntoJourneys,
  listScaleProgressJourneys,
  pushScaleProgressAttempt,
  removeScaleProgressJourney,
  SCALE_PROGRESS_MAX_ATTEMPTS,
} from "@/lib/scaleProgressHistory";
import {
  clearScalePracticeHistory,
  listScalePracticeHistory,
  persistScalePracticeSession,
  pushScalePracticeHistory,
  readScalePracticeHistoryEntry,
  SCALE_HISTORY_MAX,
} from "@/lib/scalePracticeSession";
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
    summary: {
      ...base.summary,
      ...overrides.summary,
    },
    notes: overrides.notes ?? base.notes,
    expectedNotesMidi: overrides.expectedNotesMidi ?? base.expectedNotesMidi,
  };
}

function stubStorage() {
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
}

describe("scale progress journeys", () => {
  beforeEach(() => {
    stubStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("groups attempts by scale and octave, keeps other journeys intact", () => {
    pushScaleProgressAttempt(
      makeSession({
        sessionId: "c1",
        scaleId: "C_major",
        scaleLabel: "C major",
        octaveSpan: 1,
        summary: { inTunePercent: 70 } as ScalePracticeSessionV1["summary"],
        recordedAt: "2026-03-01T10:00:00.000Z",
      }),
    );
    pushScaleProgressAttempt(
      makeSession({
        sessionId: "d1",
        scaleId: "D_major",
        scaleLabel: "D major",
        tonicPitchClass: 2,
        octaveSpan: 1,
        summary: { inTunePercent: 50 } as ScalePracticeSessionV1["summary"],
        recordedAt: "2026-03-02T10:00:00.000Z",
      }),
    );
    pushScaleProgressAttempt(
      makeSession({
        sessionId: "c2",
        scaleId: "C_major",
        scaleLabel: "C major",
        octaveSpan: 1,
        summary: { inTunePercent: 84 } as ScalePracticeSessionV1["summary"],
        recordedAt: "2026-03-03T10:00:00.000Z",
      }),
    );
    pushScaleProgressAttempt(
      makeSession({
        sessionId: "c2oct",
        scaleId: "C_major",
        scaleLabel: "C major",
        octaveSpan: 2,
        summary: { inTunePercent: 60 } as ScalePracticeSessionV1["summary"],
        recordedAt: "2026-03-04T10:00:00.000Z",
      }),
    );

    const journeys = listScaleProgressJourneys();
    expect(journeys).toHaveLength(3);
    expect(journeys[0]?.progressKey).toBe("C_major__2");
    expect(journeys.find((j) => j.progressKey === "C_major__1")?.attempts).toHaveLength(
      2,
    );
    expect(journeys.find((j) => j.progressKey === "C_major__1")?.bestInTunePercent).toBe(
      84,
    );
  });

  it("stores last range settings for continue", () => {
    pushScaleProgressAttempt(
      makeSession({
        sessionId: "c1",
        octaveSpan: 2,
        rootMidi: 48,
        octaveRangeLabel: "C3 → C5",
        summary: { inTunePercent: 60 } as ScalePracticeSessionV1["summary"],
      }),
    );
    const j = listScaleProgressJourneys()[0]!;
    expect(j.lastOctaveSpan).toBe(2);
    expect(j.lastRootMidi).toBe(48);
    expect(j.lastOctaveRangeLabel).toBe("C3 → C5");
  });

  it("migrates legacy flat history into journeys", () => {
    const legacy = [
      makeSession({
        sessionId: "a",
        scaleId: "C_major",
        recordedAt: "2026-03-02T00:00:00.000Z",
        summary: { inTunePercent: 80 } as ScalePracticeSessionV1["summary"],
      }),
      makeSession({
        sessionId: "b",
        scaleId: "G_major",
        scaleLabel: "G major",
        tonicPitchClass: 7,
        recordedAt: "2026-03-01T00:00:00.000Z",
        summary: { inTunePercent: 55 } as ScalePracticeSessionV1["summary"],
      }),
    ];
    localStorage.setItem(
      "musai-scale-practice-history-v1",
      JSON.stringify(legacy),
    );

    const journeys = listScaleProgressJourneys();
    expect(journeys).toHaveLength(2);
    expect(journeys.map((j) => j.scaleId).sort()).toEqual([
      "C_major",
      "G_major",
    ]);
    expect(localStorage.getItem("musai-scale-practice-history-v1")).toBeNull();
  });

  it("caps attempts per scale", () => {
    for (let i = 0; i < SCALE_PROGRESS_MAX_ATTEMPTS + 4; i++) {
      pushScaleProgressAttempt(
        makeSession({
          sessionId: `id-${i}`,
          recordedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
          summary: {
            inTunePercent: 40 + (i % 50),
          } as ScalePracticeSessionV1["summary"],
        }),
      );
    }
    expect(listScaleProgressJourneys()[0]?.attempts).toHaveLength(
      SCALE_PROGRESS_MAX_ATTEMPTS,
    );
  });

  it("removes a whole scale journey", () => {
    pushScaleProgressAttempt(makeSession({ sessionId: "c1", scaleId: "C_major" }));
    pushScaleProgressAttempt(
      makeSession({
        sessionId: "d1",
        scaleId: "D_major",
        scaleLabel: "D major",
        tonicPitchClass: 2,
      }),
    );
    removeScaleProgressJourney("C_major__1");
    expect(listScaleProgressJourneys().map((j) => j.progressKey)).toEqual([
      "D_major__1",
    ]);
  });

  it("formats last practised as Today / Yesterday", () => {
    const now = new Date("2026-03-10T15:00:00.000Z");
    expect(formatLastPractised("2026-03-10T08:00:00.000Z", now)).toBe("Today");
    expect(formatLastPractised("2026-03-09T08:00:00.000Z", now)).toBe(
      "Yesterday",
    );
  });

  it("buildJourneyFromAttempts is chronological", () => {
    const j = buildJourneyFromAttempts([
      makeSession({
        sessionId: "new",
        recordedAt: "2026-03-02T00:00:00.000Z",
        summary: { inTunePercent: 90 } as ScalePracticeSessionV1["summary"],
      }),
      makeSession({
        sessionId: "old",
        recordedAt: "2026-03-01T00:00:00.000Z",
        summary: { inTunePercent: 40 } as ScalePracticeSessionV1["summary"],
      }),
    ]);
    expect(j?.attempts.map((a) => a.sessionId)).toEqual(["old", "new"]);
    expect(j?.bestInTunePercent).toBe(90);
  });

  it("groupSessionsIntoJourneys keeps newest practised first", () => {
    const grouped = groupSessionsIntoJourneys([
      makeSession({
        sessionId: "d",
        scaleId: "D_major",
        scaleLabel: "D major",
        recordedAt: "2026-03-03T00:00:00.000Z",
      }),
      makeSession({
        sessionId: "c",
        scaleId: "C_major",
        recordedAt: "2026-03-01T00:00:00.000Z",
      }),
    ]);
    expect(grouped[0]?.progressKey).toBe("D_major__1");
  });
});

describe("scalePracticeSession history facade", () => {
  beforeEach(() => {
    stubStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists current session and groups history by scale", () => {
    const a = makeSession({
      sessionId: "a",
      recordedAt: "2026-01-02T00:00:00.000Z",
      summary: { inTunePercent: 70 } as ScalePracticeSessionV1["summary"],
    });
    persistScalePracticeSession(a);
    expect(listScalePracticeHistory()).toHaveLength(1);

    const b = makeSession({
      sessionId: "b",
      recordedAt: "2026-01-03T00:00:00.000Z",
      summary: { inTunePercent: 80 } as ScalePracticeSessionV1["summary"],
    });
    persistScalePracticeSession(b);
    expect(listScalePracticeHistory().map((s) => s.sessionId)).toEqual([
      "b",
      "a",
    ]);
    expect(readScalePracticeHistoryEntry("a")?.sessionId).toBe("a");
    expect(listScaleProgressJourneys()[0]?.attempts).toHaveLength(2);
  });

  it("dedupes by session id within a journey", () => {
    pushScalePracticeHistory(makeSession({ sessionId: "same" }));
    pushScalePracticeHistory(
      makeSession({
        sessionId: "same",
        summary: { inTunePercent: 55 } as ScalePracticeSessionV1["summary"],
      }),
    );
    expect(listScaleProgressJourneys()[0]?.attempts).toHaveLength(1);
  });

  it("clear helpers wipe storage", () => {
    persistScalePracticeSession(makeSession());
    clearScalePracticeHistory();
    clearScaleProgressHistory();
    expect(listScalePracticeHistory()).toHaveLength(0);
    expect(listScaleProgressJourneys()).toHaveLength(0);
  });

  it("SCALE_HISTORY_MAX remains exported for callers", () => {
    expect(SCALE_HISTORY_MAX).toBeGreaterThan(0);
  });
});
