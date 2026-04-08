import { describe, expect, it } from "vitest";
import {
  analyzeScalePerformance,
  computeScaleSummary,
  intonationBucketForCents,
} from "@/lib/analyzeScalePerformance";
import type { ScalePracticeNoteRow } from "@/lib/scalePracticeTypes";
import { midiToHz } from "@/lib/intonation";

describe("intonationBucketForCents", () => {
  it("classifies in tune band", () => {
    expect(intonationBucketForCents(0, false)).toBe("in_tune");
    expect(intonationBucketForCents(10, false)).toBe("in_tune");
    expect(intonationBucketForCents(-10, false)).toBe("in_tune");
  });
  it("sharp and flat outside band", () => {
    expect(intonationBucketForCents(15, false)).toBe("sharp");
    expect(intonationBucketForCents(-15, false)).toBe("flat");
  });
  it("missing → unknown", () => {
    expect(intonationBucketForCents(0, true)).toBe("unknown");
  });
});

describe("computeScaleSummary", () => {
  it("aggregates rows", () => {
    const rows: ScalePracticeNoteRow[] = [
      {
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        detectedMidi: 60,
        detectedNoteLabel: "C4",
        detectedHz: midiToHz(60),
        centsDifference: 2,
        intonationBucket: "in_tune",
        missingData: false,
      },
      {
        noteIndex: 1,
        expectedMidi: 62,
        expectedNoteLabel: "D4",
        detectedMidi: 63,
        detectedNoteLabel: "D#4",
        detectedHz: midiToHz(63),
        centsDifference: 100,
        intonationBucket: "sharp",
        missingData: false,
      },
    ];
    const s = computeScaleSummary(rows);
    expect(s.notesAnalyzed).toBe(2);
    expect(s.notesMissing).toBe(0);
    expect(s.weakestNoteIndices[0]).toBe(1);
    expect(s.trend).toBe("sharp");
  });
});

describe("analyzeScalePerformance", () => {
  it("returns one row per expected note with silence (missing windows)", () => {
    const mono = new Float32Array(48000 * 2).fill(0);
    const r = analyzeScalePerformance({
      mono,
      sampleRateHz: 48000,
      expectedMidis: [60, 62, 64],
    });
    expect(r.notes).toHaveLength(3);
    expect(r.notes.every((n) => n.missingData)).toBe(true);
    expect(r.summary.notesMissing).toBe(3);
  });
});
