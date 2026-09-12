import { describe, expect, it } from "vitest";
import {
  masteryPercentThroughTake,
  withMasteryAfterTake,
} from "@/lib/scaleMasteryTimeline";
import { buildLoopMastery } from "@/lib/scalePracticeProgress";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function session(
  partial: Partial<{
    sessionId: string;
    inTunePercent: number;
    inTuneCount: number;
    total: number;
    notesAnalyzed?: number;
    masteryPercentAfterTake?: number;
  }> = {},
): ScalePracticeSessionV1 {
  const total = partial.total ?? 8;
  const inTuneCount =
    partial.inTuneCount ?? Math.round((partial.inTunePercent ?? 50) / 12.5);
  const analyzed = partial.notesAnalyzed ?? total;
  const notes = Array.from({ length: total }, (_, i) => {
    const missing = i >= analyzed;
    const inTune = !missing && i < inTuneCount;
    return {
      noteIndex: i,
      expectedMidi: 60 + i,
      expectedNoteLabel: "C4",
      detectedMidi: missing ? 0 : 60 + i,
      detectedNoteLabel: missing ? "—" : "C4",
      detectedHz: missing ? 0 : 261,
      centsDifference: missing ? 0 : inTune ? 0 : 35,
      intonationBucket: missing
        ? ("unknown" as const)
        : inTune
          ? ("in_tune" as const)
          : ("sharp" as const),
      missingData: missing,
    };
  });
  return {
    schemaVersion: 1,
    sessionId: partial.sessionId ?? "s1",
    exerciseType: "scale_practice",
    recordedAt: "2026-01-01T00:00:00.000Z",
    scaleId: "C_major",
    scaleLabel: "C major",
    scaleKind: "major",
    tonicPitchClass: 0,
    octaveSpan: 1,
    octaveRangeLabel: "C4 → C5",
    rootMidi: 60,
    expectedNotesMidi: notes.map((n) => n.expectedMidi),
    audioSourceType: "uploaded",
    sampleRateHz: 48000,
    notes,
    summary: {
      overallScore0to100: partial.inTunePercent ?? 50,
      averageAbsCents: 12,
      inTunePercent: partial.inTunePercent ?? 50,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: analyzed,
      notesMissing: total - analyzed,
    },
    ...(typeof partial.masteryPercentAfterTake === "number"
      ? { masteryPercentAfterTake: partial.masteryPercentAfterTake }
      : {}),
  };
}

describe("scaleMasteryTimeline", () => {
  it("stores mastery after each take without changing prior takes", () => {
    const a = session({
      sessionId: "t3",
      inTunePercent: 40,
      inTuneCount: 3,
    });
    const stampedA = withMasteryAfterTake(a, []);
    expect(stampedA.masteryPercentAfterTake).toBe(
      buildLoopMastery([a]).percent,
    );

    const b = session({
      sessionId: "t7",
      inTunePercent: 70,
      inTuneCount: 5,
    });
    const stampedB = withMasteryAfterTake(b, [stampedA]);
    expect(stampedA.masteryPercentAfterTake).toBe(
      buildLoopMastery([a]).percent,
    );
    expect(stampedB.masteryPercentAfterTake).toBe(
      buildLoopMastery([stampedA, b]).percent,
    );
    expect(stampedB.masteryPercentAfterTake).toBeGreaterThan(
      stampedA.masteryPercentAfterTake!,
    );
  });

  it("reads stored mastery for a historical take and restores the latest", () => {
    const takes = [
      session({
        sessionId: "t3",
        inTunePercent: 40,
        inTuneCount: 3,
        masteryPercentAfterTake: 40,
      }),
      session({
        sessionId: "t7",
        inTunePercent: 70,
        inTuneCount: 5,
        masteryPercentAfterTake: 68,
      }),
      session({
        sessionId: "t12",
        inTunePercent: 85,
        inTuneCount: 7,
        masteryPercentAfterTake: 85,
      }),
      session({
        sessionId: "t18",
        inTunePercent: 100,
        inTuneCount: 8,
        masteryPercentAfterTake: 100,
      }),
    ];

    expect(masteryPercentThroughTake(takes, "t7")).toBe(68);
    expect(masteryPercentThroughTake(takes, "t18")).toBe(100);
    expect(masteryPercentThroughTake(takes, "t3")).toBe(40);
  });

  it("falls back to folding when older takes lack a stored snapshot", () => {
    const a = session({
      sessionId: "a",
      inTunePercent: 50,
      inTuneCount: 4,
    });
    const b = session({
      sessionId: "b",
      inTunePercent: 80,
      inTuneCount: 6,
    });
    expect(masteryPercentThroughTake([a, b], "a")).toBe(
      buildLoopMastery([a]).percent,
    );
    expect(masteryPercentThroughTake([a, b], "b")).toBe(
      buildLoopMastery([a, b]).percent,
    );
  });
});
