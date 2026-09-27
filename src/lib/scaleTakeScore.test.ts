import { describe, expect, it } from "vitest";
import type { ScalePracticeNoteRow } from "@/lib/scalePracticeTypes";
import {
  completenessScore,
  intonationScore,
  noteAccuracyScore,
  scoreScaleTake,
} from "@/lib/scaleTakeScore";

function row(
  partial: Partial<ScalePracticeNoteRow> & { expectedMidi: number },
): ScalePracticeNoteRow {
  const missing = partial.missingData === true;
  return {
    noteIndex: partial.noteIndex ?? 0,
    expectedMidi: partial.expectedMidi,
    expectedNoteLabel: "N",
    detectedMidi: missing ? 0 : (partial.detectedMidi ?? partial.expectedMidi),
    detectedNoteLabel: missing ? "—" : "N",
    detectedHz: missing ? 0 : 261,
    centsDifference: missing ? 0 : (partial.centsDifference ?? 0),
    intonationBucket: missing
      ? "unknown"
      : Math.abs(partial.centsDifference ?? 0) <= 25
        ? "in_tune"
        : (partial.centsDifference ?? 0) > 0
          ? "sharp"
          : "flat",
    missingData: missing,
    ...partial,
  };
}

function scale(rows: ScalePracticeNoteRow[]) {
  const analyzed = rows.filter((r) => !r.missingData).length;
  return scoreScaleTake(rows, {
    notesAnalyzed: analyzed,
    notesMissing: rows.length - analyzed,
    inTunePercent:
      analyzed === 0
        ? 0
        : (100 * rows.filter((r) => r.intonationBucket === "in_tune").length) /
          analyzed,
    overallScore0to100: 90,
  });
}

describe("scaleTakeScore categories", () => {
  it("scores a complete in-tune scale at 100", () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      row({ noteIndex: i, expectedMidi: 60 + i, centsDifference: 2 }),
    );
    const scored = scale(notes);
    expect(scored.excellent).toBe(true);
    expect(scored.score).toBe(100);
    expect(scored.categories.completeness).toBe(100);
    expect(scored.categories.noteAccuracy).toBeGreaterThanOrEqual(94);
  });

  it("caps a two-note fragment even when those notes are in tune", () => {
    const notes = [
      row({ noteIndex: 0, expectedMidi: 60, centsDifference: 0 }),
      row({ noteIndex: 1, expectedMidi: 62, centsDifference: 0 }),
      ...Array.from({ length: 6 }, (_, i) =>
        row({
          noteIndex: i + 2,
          expectedMidi: 64 + i,
          missingData: true,
        }),
      ),
    ];
    const scored = scale(notes);
    expect(scored.categories.completeness).toBe(25);
    expect(scored.score).toBeLessThan(30);
    expect(scored.capped).toBe(true);
    expect(scored.excellent).toBe(false);
  });

  it("will not let a full out-of-tune scale look complete", () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      row({
        noteIndex: i,
        expectedMidi: 60 + i,
        centsDifference: 40,
      }),
    );
    const scored = scale(notes);
    expect(scored.categories.completeness).toBe(100);
    expect(scored.score).toBeLessThan(55);
    expect(scored.excellent).toBe(false);
  });

  it("keeps intonation from looking perfect when half the scale is missing", () => {
    const notes = [
      ...Array.from({ length: 4 }, (_, i) =>
        row({ noteIndex: i, expectedMidi: 60 + i, centsDifference: 0 }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        row({
          noteIndex: i + 4,
          expectedMidi: 67 + i,
          missingData: true,
        }),
      ),
    ];
    expect(intonationScore(notes)).toBeLessThan(90);
    expect(noteAccuracyScore(notes)).toBeLessThanOrEqual(50);
    expect(completenessScore(notes)).toBe(50);
    expect(scale(notes).score).toBeLessThanOrEqual(50);
  });
});
