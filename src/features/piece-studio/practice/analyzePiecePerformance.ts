import { matchPiecePitch, type PiecePitchMatch } from "@/features/piece-studio/pitch/piecePitchMatch";
import { centsFromMatchedHz } from "@/features/piece-studio/pitch/centsFromMatchedHz";
import {
  PRACTICE_IN_TUNE_CENTS,
  scoreForAbsCents,
} from "@/lib/intonationScore";

export type PieceNoteResult = {
  expectedMidi: number;
  detectedHz: number | null;
  cents: number | null;
  missing: boolean;
};

export type PiecePerformanceResult = {
  notes: PieceNoteResult[];
  notesHeard: number;
  notesExpected: number;
  notesMissing: number;
  inTunePercent: number;
  averageAbsCents: number;
  meanSignedCents: number;
  score0to100: number | null;
  durationSec: number;
};

export function performanceFromPitchMatch(
  match: PiecePitchMatch,
  expectedMidis: readonly number[],
): PiecePerformanceResult {
  const expected = expectedMidis;
  if (expected.length === 0) {
    return {
      notes: [],
      notesHeard: 0,
      notesExpected: 0,
      notesMissing: 0,
      inTunePercent: 0,
      averageAbsCents: 0,
      meanSignedCents: 0,
      score0to100: null,
      durationSec: match.durationSec,
    };
  }

  const notes: PieceNoteResult[] = expected.map((midi, i) => {
    const hz = match.slots[i] ?? null;
    if (hz == null || !(hz > 0)) {
      return { expectedMidi: midi, detectedHz: null, cents: null, missing: true };
    }
    const { detectedHz, cents } = centsFromMatchedHz(hz, midi);
    return {
      expectedMidi: midi,
      detectedHz,
      cents,
      missing: false,
    };
  });

  const heard = notes.filter((n) => !n.missing);
  if (heard.length === 0) {
    return {
      notes,
      notesHeard: 0,
      notesExpected: expected.length,
      notesMissing: expected.length,
      inTunePercent: 0,
      averageAbsCents: 0,
      meanSignedCents: 0,
      score0to100: null,
      durationSec: match.durationSec,
    };
  }

  const absSum = heard.reduce((s, n) => s + Math.abs(n.cents ?? 0), 0);
  const signedSum = heard.reduce((s, n) => s + (n.cents ?? 0), 0);
  const inTune = heard.filter(
    (n) => Math.abs(n.cents ?? 0) <= PRACTICE_IN_TUNE_CENTS,
  ).length;
  const scores = heard.map((n) => scoreForAbsCents(Math.abs(n.cents ?? 0)));
  const coverage = heard.length / expected.length;
  const intonation = scores.reduce((a, b) => a + b, 0) / scores.length;
  const score0to100 = Math.round(intonation * (0.55 + 0.45 * coverage));

  return {
    notes,
    notesHeard: heard.length,
    notesExpected: expected.length,
    notesMissing: expected.length - heard.length,
    inTunePercent: Math.round((inTune / heard.length) * 100),
    averageAbsCents: Math.round(absSum / heard.length),
    meanSignedCents: signedSum / heard.length,
    score0to100: Math.max(0, Math.min(100, score0to100)),
    durationSec: match.durationSec,
  };
}

export function analyzePiecePerformance(input: {
  mono: Float32Array;
  sampleRateHz: number;
  expectedMidis: readonly number[];
  /** When provided, skips a second pitch-detection pass. */
  pitchMatch?: PiecePitchMatch;
}): PiecePerformanceResult {
  const match =
    input.pitchMatch ??
    matchPiecePitch({
      mono: input.mono,
      sampleRateHz: input.sampleRateHz,
      expectedMidis: input.expectedMidis,
    });
  return performanceFromPitchMatch(match, input.expectedMidis);
}
