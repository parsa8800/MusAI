import { describe, expect, it } from "vitest";
import {
  buildAttemptProgress,
  buildLoopAttemptMeta,
  countInTuneNotes,
  findPreviousComparableTake,
  practiceStageFromSummary,
} from "@/lib/scalePracticeProgress";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function session(
  partial: Partial<ScalePracticeSessionV1> & {
    sessionId: string;
    inTunePercent: number;
    inTuneCount: number;
    total?: number;
  },
): ScalePracticeSessionV1 {
  const total = partial.total ?? 8;
  const notes = Array.from({ length: total }, (_, i) => ({
    noteIndex: i,
    expectedMidi: 60 + i,
    expectedNoteLabel: "C4",
    detectedMidi: 60 + i,
    detectedNoteLabel: "C4",
    detectedHz: 261,
    centsDifference: i < partial.inTuneCount ? 0 : 40,
    intonationBucket:
      i < partial.inTuneCount
        ? ("in_tune" as const)
        : ("sharp" as const),
    missingData: false,
  }));
  return {
    schemaVersion: 1,
    sessionId: partial.sessionId,
    exerciseType: "scale_practice",
    recordedAt: "2026-01-01T00:00:00.000Z",
    scaleId: partial.scaleId ?? "pc0-major",
    scaleLabel: "C major",
    scaleKind: "major",
    tonicPitchClass: 0,
    octaveSpan: 1,
    octaveRangeLabel: "C4 → C5",
    rootMidi: 60,
    expectedNotesMidi: notes.map((n) => n.expectedMidi),
    audioSourceType: "recorded",
    sampleRateHz: 48000,
    notes,
    summary: {
      overallScore0to100: partial.inTunePercent,
      averageAbsCents: 20,
      inTunePercent: partial.inTunePercent,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: total,
      notesMissing: 0,
    },
  };
}

describe("practiceStageFromSummary", () => {
  it("maps low accuracy to Getting started, not Needs work", () => {
    expect(
      practiceStageFromSummary({
        overallScore0to100: 17,
        averageAbsCents: 40,
        inTunePercent: 17,
        weakestNoteIndices: [],
        trend: "sharp",
        meanSignedCents: 10,
        notesAnalyzed: 8,
        notesMissing: 0,
      }).label,
    ).toBe("Getting started");
  });

  it("maps high accuracy to Excellent", () => {
    expect(
      practiceStageFromSummary({
        overallScore0to100: 95,
        averageAbsCents: 4,
        inTunePercent: 95,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: 8,
        notesMissing: 0,
      }).label,
    ).toBe("Excellent");
  });
});

describe("buildAttemptProgress", () => {
  it("celebrates more in-tune notes vs previous", () => {
    const prev = session({ sessionId: "a", inTunePercent: 25, inTuneCount: 2 });
    const cur = session({ sessionId: "b", inTunePercent: 50, inTuneCount: 5 });
    const p = buildAttemptProgress(cur, prev);
    expect(p.kind).toBe("up");
    expect(p.line).toMatch(/3 more notes in tune/i);
  });

  it("is constructive on a tougher take", () => {
    const prev = session({ sessionId: "a", inTunePercent: 70, inTuneCount: 6 });
    const cur = session({ sessionId: "b", inTunePercent: 30, inTuneCount: 2 });
    const p = buildAttemptProgress(cur, prev);
    expect(p.kind).toBe("down");
    expect(p.line).toMatch(/Next/i);
  });

  it("handles first take", () => {
    const cur = session({ sessionId: "b", inTunePercent: 20, inTuneCount: 1 });
    expect(buildAttemptProgress(cur, null).kind).toBe("first");
  });
});

describe("findPreviousComparableTake", () => {
  it("prefers same scaleId", () => {
    const cur = session({ sessionId: "now", inTunePercent: 40, inTuneCount: 3 });
    const hist = [
      cur,
      session({
        sessionId: "other",
        scaleId: "pc7-major",
        inTunePercent: 80,
        inTuneCount: 7,
      }),
      session({
        sessionId: "same",
        scaleId: "pc0-major",
        inTunePercent: 30,
        inTuneCount: 2,
      }),
    ];
    expect(findPreviousComparableTake(cur, hist)?.sessionId).toBe("same");
  });
});

describe("countInTuneNotes", () => {
  it("counts only clear in-tune rows", () => {
    const s = session({ sessionId: "x", inTunePercent: 50, inTuneCount: 4 });
    expect(countInTuneNotes(s.notes)).toBe(4);
  });
});

describe("buildLoopAttemptMeta", () => {
  it("marks first take and tracks best", () => {
    const a = session({ sessionId: "a", inTunePercent: 40, inTuneCount: 3 });
    const meta = buildLoopAttemptMeta([a]);
    expect(meta.attemptNumber).toBe(1);
    expect(meta.isFirst).toBe(true);
    expect(meta.deltaPct).toBeNull();
    expect(meta.isNewBest).toBe(false);
    expect(meta.bestAccuracy).toBe(40);
  });

  it("shows positive delta and new best on improvement", () => {
    const a = session({ sessionId: "a", inTunePercent: 40, inTuneCount: 3 });
    const b = session({ sessionId: "b", inTunePercent: 47, inTuneCount: 4 });
    const meta = buildLoopAttemptMeta([a, b]);
    expect(meta.attemptNumber).toBe(2);
    expect(meta.deltaPct).toBe(7);
    expect(meta.isNewBest).toBe(true);
    expect(meta.bestAccuracy).toBe(47);
  });

  it("does not mark new best when accuracy drops", () => {
    const a = session({ sessionId: "a", inTunePercent: 60, inTuneCount: 5 });
    const b = session({ sessionId: "b", inTunePercent: 50, inTuneCount: 4 });
    const meta = buildLoopAttemptMeta([a, b]);
    expect(meta.deltaPct).toBe(-10);
    expect(meta.isNewBest).toBe(false);
    expect(meta.bestAccuracy).toBe(60);
  });
});
