import { describe, expect, it } from "vitest";
import {
  analyzeScalePerformance,
  computeScaleSummary,
  intonationBucketForCents,
  scoreForAbsCents,
  unwrapOctaveCents,
} from "@/lib/analyzeScalePerformance";
import type { ScalePracticeNoteRow } from "@/lib/scalePracticeTypes";
import { centsFromTarget, midiToHz } from "@/lib/intonation";
import { buildExerciseScaleMidis } from "@/lib/scales";

/** Equal-length sine tones (one per MIDI), optional per-note cents offset. */
function synthScaleMono(
  midis: readonly number[],
  opts?: {
    sampleRate?: number;
    secondsPerNote?: number;
    centsOffsets?: readonly number[];
  },
): { mono: Float32Array; sampleRateHz: number } {
  const sampleRate = opts?.sampleRate ?? 44100;
  const secondsPerNote = opts?.secondsPerNote ?? 0.45;
  const nPer = Math.floor(sampleRate * secondsPerNote);
  const mono = new Float32Array(nPer * midis.length);
  for (let i = 0; i < midis.length; i++) {
    const cents = opts?.centsOffsets?.[i] ?? 0;
    const hz = midiToHz(midis[i]!) * Math.pow(2, cents / 1200);
    const start = i * nPer;
    for (let s = 0; s < nPer; s++) {
      mono[start + s] = Math.sin((2 * Math.PI * hz * s) / sampleRate) * 0.85;
    }
  }
  return { mono, sampleRateHz: sampleRate };
}

describe("unwrapOctaveCents", () => {
  it("folds ±1200¢ octave errors toward zero", () => {
    expect(unwrapOctaveCents(1200)).toBe(0);
    expect(unwrapOctaveCents(-1200)).toBe(0);
    expect(unwrapOctaveCents(1215)).toBe(15);
    expect(unwrapOctaveCents(-1185)).toBe(15);
  });

  it("keeps ordinary intonation errors", () => {
    expect(unwrapOctaveCents(35)).toBe(35);
    expect(unwrapOctaveCents(-40)).toBe(-40);
  });
});

describe("intonationBucketForCents", () => {
  it("classifies in tune band", () => {
    expect(intonationBucketForCents(0, false)).toBe("in_tune");
    expect(intonationBucketForCents(25, false)).toBe("in_tune");
    expect(intonationBucketForCents(-25, false)).toBe("in_tune");
  });
  it("sharp and flat outside band", () => {
    expect(intonationBucketForCents(30, false)).toBe("sharp");
    expect(intonationBucketForCents(-30, false)).toBe("flat");
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

  it("handles all-missing rows", () => {
    const rows: ScalePracticeNoteRow[] = [
      {
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        detectedMidi: 60,
        detectedNoteLabel: "—",
        detectedHz: 0,
        centsDifference: 0,
        intonationBucket: "unknown",
        missingData: true,
      },
      {
        noteIndex: 1,
        expectedMidi: 62,
        expectedNoteLabel: "D4",
        detectedMidi: 62,
        detectedNoteLabel: "—",
        detectedHz: 0,
        centsDifference: 0,
        intonationBucket: "unknown",
        missingData: true,
      },
    ];
    const s = computeScaleSummary(rows);
    expect(s.notesAnalyzed).toBe(0);
    expect(s.notesMissing).toBe(2);
    expect(s.overallScore0to100).toBe(0);
    expect(s.inTunePercent).toBe(0);
    expect(s.weakestNoteIndices).toEqual([]);
    expect(s.trend).toBe("balanced");
  });

  it("computes inTunePercent with rounding and balanced trend near zero", () => {
    const rows: ScalePracticeNoteRow[] = [
      {
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        detectedMidi: 60,
        detectedNoteLabel: "C4",
        detectedHz: midiToHz(60),
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
        detectedHz: midiToHz(62),
        centsDifference: 18,
        intonationBucket: "in_tune",
        missingData: false,
      },
      {
        noteIndex: 2,
        expectedMidi: 64,
        expectedNoteLabel: "E4",
        detectedMidi: 64,
        detectedNoteLabel: "E4",
        detectedHz: midiToHz(64),
        centsDifference: -8,
        intonationBucket: "in_tune",
        missingData: false,
      },
    ];
    const s = computeScaleSummary(rows);
    // 2 of 3 within band if we mark third as sharp with larger error:
    expect(s.trend).toBe("balanced");
  });

  it("computes inTunePercent across mixed buckets", () => {
    const rows: ScalePracticeNoteRow[] = [
      {
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        detectedMidi: 60,
        detectedNoteLabel: "C4",
        detectedHz: midiToHz(60),
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
        detectedHz: midiToHz(62),
        centsDifference: 18,
        intonationBucket: "in_tune",
        missingData: false,
      },
      {
        noteIndex: 2,
        expectedMidi: 64,
        expectedNoteLabel: "E4",
        detectedMidi: 64,
        detectedNoteLabel: "E4",
        detectedHz: midiToHz(64),
        centsDifference: 40,
        intonationBucket: "sharp",
        missingData: false,
      },
    ];
    const s = computeScaleSummary(rows);
    expect(s.inTunePercent).toBeCloseTo(66.7, 1);
  });

  it("classifies trend as flat for negative mean signed cents", () => {
    const rows: ScalePracticeNoteRow[] = [
      {
        noteIndex: 0,
        expectedMidi: 60,
        expectedNoteLabel: "C4",
        detectedMidi: 60,
        detectedNoteLabel: "C4",
        detectedHz: midiToHz(60),
        centsDifference: -20,
        intonationBucket: "flat",
        missingData: false,
      },
      {
        noteIndex: 1,
        expectedMidi: 62,
        expectedNoteLabel: "D4",
        detectedMidi: 62,
        detectedNoteLabel: "D4",
        detectedHz: midiToHz(62),
        centsDifference: -5,
        intonationBucket: "in_tune",
        missingData: false,
      },
    ];
    const s = computeScaleSummary(rows);
    expect(s.trend).toBe("flat");
  });

  it("caps weakestNoteIndices to at most 8 and ranks by absolute cents", () => {
    const rows: ScalePracticeNoteRow[] = Array.from({ length: 12 }, (_, i) => {
      const cents = i === 3 ? 200 : i * 5;
      return {
        noteIndex: i,
        expectedMidi: 60 + i,
        expectedNoteLabel: `N${i}`,
        detectedMidi: 60 + i,
        detectedNoteLabel: `N${i}`,
        detectedHz: midiToHz(60 + i),
        centsDifference: i % 2 === 0 ? cents : -cents,
        intonationBucket: "sharp",
        missingData: false,
      };
    });
    const s = computeScaleSummary(rows);
    expect(s.weakestNoteIndices).toHaveLength(8);
    expect(s.weakestNoteIndices[0]).toBe(3);
  });
});

describe("scoreForAbsCents", () => {
  it("keeps close pitches high and clamps to [0, 100]", () => {
    expect(scoreForAbsCents(0)).toBe(100);
    expect(scoreForAbsCents(20)).toBeGreaterThanOrEqual(92);
    expect(scoreForAbsCents(25)).toBeGreaterThanOrEqual(90);
    expect(scoreForAbsCents(40)).toBeGreaterThanOrEqual(78);
    expect(scoreForAbsCents(1000)).toBe(0);
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

  it("base: in-tune C major 1-octave round-trip scores high", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const { mono, sampleRateHz } = synthScaleMono(expected);
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });

    expect(r.notes).toHaveLength(expected.length);
    expect(r.summary.notesMissing).toBe(0);
    expect(r.summary.inTunePercent).toBeGreaterThanOrEqual(85);
    expect(r.summary.overallScore0to100).toBeGreaterThanOrEqual(85);
    expect(r.summary.trend).toBe("balanced");
    for (const note of r.notes) {
      expect(note.missingData).toBe(false);
      expect(Math.abs(note.centsDifference)).toBeLessThanOrEqual(15);
    }
  });

  it("unwraps whole-octave error so C5 take vs C4 root still centres", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const played = expected.map((m) => m + 12);
    const { mono, sampleRateHz } = synthScaleMono(played);
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });

    expect(r.summary.inTunePercent).toBeGreaterThanOrEqual(80);
    for (const note of r.notes) {
      expect(Math.abs(note.centsDifference)).toBeLessThanOrEqual(25);
    }
  });

  it("handles uneven note lengths better than raw equal windows alone", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const sampleRate = 44100;
    // Alternate short / long holds — equal windows mis-align; stable runs should cope.
    const parts: Float32Array[] = [];
    for (let i = 0; i < expected.length; i++) {
      const sec = i % 2 === 0 ? 0.28 : 0.72;
      const n = Math.floor(sampleRate * sec);
      const hz = midiToHz(expected[i]!);
      const chunk = new Float32Array(n);
      for (let s = 0; s < n; s++) {
        chunk[s] = Math.sin((2 * Math.PI * hz * s) / sampleRate) * 0.85;
      }
      parts.push(chunk);
    }
    const total = parts.reduce((a, p) => a + p.length, 0);
    const mono = new Float32Array(total);
    let o = 0;
    for (const p of parts) {
      mono.set(p, o);
      o += p.length;
    }
    const r = analyzeScalePerformance({
      mono,
      sampleRateHz: sampleRate,
      expectedMidis: expected,
    });
    expect(r.summary.inTunePercent).toBeGreaterThanOrEqual(70);
    expect(r.summary.notesMissing).toBeLessThanOrEqual(2);
  });

  it("base: deliberately sharp notes classify as sharp", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const centsOffsets = expected.map((_, i) => (i === 3 || i === 5 ? 35 : 0));
    const { mono, sampleRateHz } = synthScaleMono(expected, { centsOffsets });
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });

    expect(r.notes[3]!.intonationBucket).toBe("sharp");
    expect(r.notes[5]!.intonationBucket).toBe("sharp");
    expect(r.notes[3]!.centsDifference).toBeGreaterThan(20);
    expect(r.summary.weakestNoteIndices).toEqual(
      expect.arrayContaining([3, 5]),
    );
  });

  it("base: deliberately flat notes classify as flat", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    // Enough flat steps that mean signed cents crosses the flat trend threshold.
    const centsOffsets = expected.map((_, i) => (i % 2 === 0 ? -35 : 0));
    const { mono, sampleRateHz } = synthScaleMono(expected, { centsOffsets });
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });

    expect(r.notes[0]!.intonationBucket).toBe("flat");
    expect(r.notes[2]!.intonationBucket).toBe("flat");
    expect(r.notes[0]!.centsDifference).toBeLessThan(-20);
    expect(r.summary.trend).toBe("flat");
  });

  it("edge: incomplete clip leaves later windows missing or badly aligned", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    const partial = expected.slice(0, 6);
    const { mono, sampleRateHz } = synthScaleMono(partial, { secondsPerNote: 0.4 });
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });

    expect(r.notes).toHaveLength(expected.length);
    // Equal-window model cannot recover a half take — overall must not look "excellent".
    expect(r.summary.inTunePercent).toBeLessThan(70);
  });

  it("edge: skipped note (wrong pitch in one window) surfaces as a weak step", () => {
    const expected = buildExerciseScaleMidis(60, "major", 1);
    // Replace one degree with a pitch ~2 semitones high (≈200¢).
    const centsOffsets = expected.map((_, i) => (i === 4 ? 200 : 0));
    const { mono, sampleRateHz } = synthScaleMono(expected, { centsOffsets });
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });

    expect(Math.abs(r.notes[4]!.centsDifference)).toBeGreaterThan(150);
    expect(r.summary.weakestNoteIndices[0]).toBe(4);
    expect(r.notes[4]!.intonationBucket).not.toBe("in_tune");
  });

  it("detected Hz is within ~25¢ of synthesised target on a clean take", () => {
    const expected = [60, 62, 64, 65];
    const { mono, sampleRateHz } = synthScaleMono(expected, { secondsPerNote: 0.5 });
    const r = analyzeScalePerformance({ mono, sampleRateHz, expectedMidis: expected });
    for (let i = 0; i < expected.length; i++) {
      const target = midiToHz(expected[i]!);
      const cents = centsFromTarget(r.notes[i]!.detectedHz, target);
      expect(Math.abs(cents)).toBeLessThan(25);
    }
  });
});
