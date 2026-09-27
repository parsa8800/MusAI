import {
  collectPitchFrames,
  collectStablePitchRuns,
  hzToMidi,
  matchDetectedRunsDetailed,
  preferFundamentalNearTargetHz,
  type PitchFrame,
} from "@/lib/analyzePitch";
import { scoreScaleTake } from "@/lib/scaleTakeScore";
import { centsFromTarget, formatNoteLabel, midiToHz } from "@/lib/intonation";
import {
  SCALE_CLEAR_MISS_CENTS,
  SCALE_IN_TUNE_CENTS,
  scoreForAbsCents,
  unwrapOctaveCents,
} from "@/lib/intonationScore";
import type { InstrumentProfile } from "@/lib/instrument/types";
import type {
  ScalePracticeIntonationBucket,
  ScalePracticeNoteRow,
  ScalePracticeSummary,
  ScalePracticeTrend,
} from "@/lib/scalePracticeTypes";

export {
  SCALE_CLEAR_MISS_CENTS,
  SCALE_IN_TUNE_CENTS,
  scoreForAbsCents,
  unwrapOctaveCents,
} from "@/lib/intonationScore";

export function intonationBucketForCents(
  cents: number,
  missing: boolean,
): ScalePracticeIntonationBucket {
  if (missing) return "unknown";
  const a = Math.abs(cents);
  if (a <= SCALE_IN_TUNE_CENTS) return "in_tune";
  return cents > 0 ? "sharp" : "flat";
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
      progressScore0to100: 0,
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

  const draft: ScalePracticeSummary = {
    overallScore0to100,
    averageAbsCents: Math.round((absSum / valid.length) * 10) / 10,
    inTunePercent: Math.round((inTune / valid.length) * 1000) / 10,
    weakestNoteIndices,
    trend,
    meanSignedCents: Math.round(meanSigned * 10) / 10,
    notesAnalyzed: valid.length,
    notesMissing: missing,
  };
  const take = scoreScaleTake(rows, draft);
  return {
    ...draft,
    progressScore0to100: Math.round(take.score),
  };
}

export type ScaleAnalysisInput = {
  mono: Float32Array;
  sampleRateHz: number;
  expectedMidis: readonly number[];
  instrument?: InstrumentProfile;
};

export type ScaleAnalysisResult = {
  frames: PitchFrame[];
  /**
   * One row per expectedScaleNote. Feedback (`missingData: false`) exists only
   * when a detectedNote was matched to that slot. Unplayed notes stay missing.
   */
  notes: ScalePracticeNoteRow[];
  summary: ScalePracticeSummary;
};

/** Labels of notes that actually had sufficient audio evidence, in scale order. */
export function listDetectedNoteLabels(
  notes: readonly ScalePracticeNoteRow[],
): string[] {
  return notes
    .filter((n) => !n.missingData)
    .map((n) => n.detectedNoteLabel);
}

/**
 * Build feedback rows: one per expectedScaleNote.
 * Intonation is computed only for slots that received a matched detectedNote.
 */
function runToneMetrics(hz: number[], clarities?: number[]) {
  const midis = hz.filter((h) => h > 0).map((h) => hzToMidi(h));
  let pitchStabilityCents = 0;
  if (midis.length >= 2) {
    const meanMidi = midis.reduce((a, b) => a + b, 0) / midis.length;
    const variance =
      midis.reduce((s, m) => s + (m - meanMidi) ** 2, 0) / (midis.length - 1);
    pitchStabilityCents = Math.round(Math.sqrt(variance) * 1000) / 10;
  }
  const meanClarity =
    clarities && clarities.length > 0
      ? clarities.reduce((a, b) => a + b, 0) / clarities.length
      : undefined;
  return { pitchStabilityCents, meanClarity };
}

export function notesFromExpectedMidis(
  frames: PitchFrame[],
  expectedMidis: readonly number[],
): ScalePracticeNoteRow[] {
  const slots = matchDetectedRunsDetailed(
    collectStablePitchRuns(frames),
    expectedMidis,
  );

  return expectedMidis.map((expectedMidi, i) => {
    const slot = slots[i];
    const hz = slot?.hz ?? null;
    const missing = hz === null || hz <= 0;
    const targetHz = midiToHz(expectedMidi);

    if (missing) {
      return {
        noteIndex: i,
        expectedMidi,
        expectedNoteLabel: formatNoteLabel(expectedMidi),
        // Do not copy the expected MIDI onto unplayed notes.
        detectedMidi: 0,
        detectedNoteLabel: "—",
        detectedHz: 0,
        centsDifference: 0,
        intonationBucket: "unknown" as const,
        missingData: true,
      };
    }

    const adjustedHz = preferFundamentalNearTargetHz(hz, targetHz);
    const rawCents = centsFromTarget(adjustedHz, targetHz);
    const cents = unwrapOctaveCents(rawCents);
    const detectedMidi = Math.round(hzToMidi(adjustedHz));
    const run = slot!.run;
    const durationSec = Math.max(0, run.timeEndSec - run.timeStartSec);
    const tone = runToneMetrics(run.hz, run.clarities);

    return {
      noteIndex: i,
      expectedMidi,
      expectedNoteLabel: formatNoteLabel(expectedMidi),
      detectedMidi,
      detectedNoteLabel: formatNoteLabel(detectedMidi),
      detectedHz: adjustedHz,
      centsDifference: Math.round(cents * 10) / 10,
      intonationBucket: intonationBucketForCents(cents, false),
      missingData: false,
      durationSec,
      onsetSec: run.timeStartSec,
      ...(tone.meanClarity != null ? { meanClarity: tone.meanClarity } : {}),
      pitchStabilityCents: tone.pitchStabilityCents,
    };
  });
}

export function analyzeScaleFromFrames(
  frames: PitchFrame[],
  expectedMidis: readonly number[],
): ScaleAnalysisResult {
  const notes = notesFromExpectedMidis(frames, expectedMidis);
  return { frames, notes, summary: computeScaleSummary(notes) };
}

/**
 * Scale analysis: adaptive note segmentation + octave-unwrapped cents.
 * Pure function — safe to call from workers or tests with a mono buffer.
 */
export function analyzeScalePerformance(input: ScaleAnalysisInput): ScaleAnalysisResult {
  const { mono, sampleRateHz, expectedMidis, instrument } = input;
  const frames = collectPitchFrames(
    mono,
    sampleRateHz,
    instrument
      ? {
          mode: "scale",
          minHz: instrument.pitch.minHz,
          maxHz: instrument.pitch.practiceMaxHz,
        }
      : { mode: "scale" },
  );
  return analyzeScaleFromFrames(frames, expectedMidis);
}
