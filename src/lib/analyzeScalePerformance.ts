import {
  collectPitchFrames,
  hzToMidi,
  medianHzPerEqualWindow,
  type PitchFrame,
} from "@/lib/analyzePitch";
import { centsFromTarget, formatNoteLabel, midiToHz } from "@/lib/intonation";
import type {
  ScalePracticeIntonationBucket,
  ScalePracticeNoteRow,
  ScalePracticeSummary,
  ScalePracticeTrend,
} from "@/lib/scalePracticeTypes";

/** Cents within this band count as “in tune” for scale rows & % metric. */
export const SCALE_IN_TUNE_CENTS = 10;

export function intonationBucketForCents(
  cents: number,
  missing: boolean,
): ScalePracticeIntonationBucket {
  if (missing) return "unknown";
  const a = Math.abs(cents);
  if (a <= SCALE_IN_TUNE_CENTS) return "in_tune";
  return cents > 0 ? "sharp" : "flat";
}

export function scoreForAbsCents(absCents: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - absCents * 1.6)));
}

export function computeScaleSummary(
  rows: ScalePracticeNoteRow[],
): ScalePracticeSummary {
  const valid = rows.filter((r) => !r.missingData);
  const missing = rows.length - valid.length;

  if (valid.length === 0) {
    return {
      overallScore0to100: 0,
      averageAbsCents: 0,
      inTunePercent: 0,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: 0,
      notesMissing: missing,
    };
  }

  const absSum = valid.reduce((s, r) => s + Math.abs(r.centsDifference), 0);
  const signedSum = valid.reduce((s, r) => s + r.centsDifference, 0);
  const inTune = valid.filter(
    (r) => Math.abs(r.centsDifference) <= SCALE_IN_TUNE_CENTS,
  ).length;

  const scores = valid.map((r) => scoreForAbsCents(Math.abs(r.centsDifference)));
  const overallScore0to100 = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );

  const meanSigned = signedSum / valid.length;
  let trend: ScalePracticeTrend = "balanced";
  if (meanSigned > 6) trend = "sharp";
  else if (meanSigned < -6) trend = "flat";

  const ranked = [...valid].sort(
    (a, b) =>
      Math.abs(b.centsDifference) - Math.abs(a.centsDifference),
  );
  const weakestNoteIndices = ranked.slice(0, 8).map((r) => r.noteIndex);

  return {
    overallScore0to100,
    averageAbsCents: Math.round((absSum / valid.length) * 10) / 10,
    inTunePercent: Math.round((inTune / valid.length) * 1000) / 10,
    weakestNoteIndices,
    trend,
    meanSignedCents: Math.round(meanSigned * 10) / 10,
    notesAnalyzed: valid.length,
    notesMissing: missing,
  };
}

export type ScaleAnalysisInput = {
  mono: Float32Array;
  sampleRateHz: number;
  expectedMidis: readonly number[];
};

export type ScaleAnalysisResult = {
  frames: PitchFrame[];
  notes: ScalePracticeNoteRow[];
  summary: ScalePracticeSummary;
};

/**
 * Windowed analysis: one temporal window per expected scale tone.
 * Pure function — safe to call from workers or tests with a mono buffer.
 */
export function analyzeScalePerformance(input: ScaleAnalysisInput): ScaleAnalysisResult {
  const { mono, sampleRateHz, expectedMidis } = input;
  const frames = collectPitchFrames(mono, sampleRateHz);
  const hzBuckets = medianHzPerEqualWindow(frames, expectedMidis.length);

  const notes: ScalePracticeNoteRow[] = expectedMidis.map((expectedMidi, i) => {
    const hz = hzBuckets[i];
    const missing = hz === null || hz <= 0;
    const targetHz = midiToHz(expectedMidi);

    if (missing) {
      return {
        noteIndex: i,
        expectedMidi,
        expectedNoteLabel: formatNoteLabel(expectedMidi),
        detectedMidi: expectedMidi,
        detectedNoteLabel: "—",
        detectedHz: 0,
        centsDifference: 0,
        intonationBucket: "unknown",
        missingData: true,
      };
    }

    const cents = centsFromTarget(hz, targetHz);
    const detectedMidi = Math.round(hzToMidi(hz));

    return {
      noteIndex: i,
      expectedMidi,
      expectedNoteLabel: formatNoteLabel(expectedMidi),
      detectedMidi,
      detectedNoteLabel: formatNoteLabel(detectedMidi),
      detectedHz: hz,
      centsDifference: Math.round(cents * 10) / 10,
      intonationBucket: intonationBucketForCents(cents, false),
      missingData: false,
    };
  });

  const summary = computeScaleSummary(notes);
  return { frames, notes, summary };
}
