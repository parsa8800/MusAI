import type { StablePitchRun } from "@/lib/analyzePitch";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  type ScaleExerciseMotion,
  type ScaleKind,
} from "@/lib/scales";

/**
 * How many sequential descending degrees must be heard after the peak
 * before we treat the take as ascending + descending.
 * One stray lower pitch must not flip the exercise.
 */
export const DESCENT_INTENT_MIN_NOTES = 3;

/** Semitone tolerance when matching a pitch run to an expected degree. */
export const DESCENT_INTENT_SEMI_TOL = 0.75;

/** Matching may skip this many expected descent degrees (missed notes). */
export const DESCENT_INTENT_MAX_SKIP = 1;

type MidiHint = { midiCenter: number };

function absSemi(a: number, b: number): number {
  return Math.abs(a - b);
}

function runMatchesMidi(run: MidiHint, expectedMidi: number): boolean {
  return absSemi(run.midiCenter, expectedMidi) <= DESCENT_INTENT_SEMI_TOL;
}

/**
 * Walk runs along the ascending scale and return the run index where the
 * peak (upper tonic) was heard, or -1 if the peak was never reached.
 */
export function findPeakRunIndex(
  runs: readonly MidiHint[],
  ascendingMidis: readonly number[],
): number {
  if (runs.length === 0 || ascendingMidis.length < 2) return -1;
  const peakIdx = ascendingMidis.length - 1;
  let cursor = 0;
  let peakRun = -1;

  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri]!;
    const searchEnd = Math.min(peakIdx, cursor + 2);
    let found = -1;
    for (let j = cursor; j <= searchEnd; j++) {
      if (runMatchesMidi(run, ascendingMidis[j]!)) {
        found = j;
        break;
      }
    }
    if (found < 0) continue;
    if (found === peakIdx) peakRun = ri;
    cursor = found + 1;
    if (cursor > peakIdx) break;
  }

  return peakRun;
}

/**
 * After the peak run, count how many descending scale degrees match in order.
 * Allows a small skip for a missed note; stops at the first real mismatch.
 */
export function countDescendingMatchesAfterPeak(
  runs: readonly MidiHint[],
  ascendingMidis: readonly number[],
  peakRunIndex: number,
): number {
  if (peakRunIndex < 0 || peakRunIndex >= runs.length - 1) return 0;
  if (ascendingMidis.length < 3) return 0;

  const descent = ascendingMidis.slice(0, -1).reverse();
  const after = runs.slice(peakRunIndex + 1);
  let matched = 0;
  let runIdx = 0;
  let expectedIdx = 0;

  while (expectedIdx < descent.length && runIdx < after.length) {
    const searchEnd = Math.min(
      after.length - 1,
      runIdx + DESCENT_INTENT_MAX_SKIP,
    );
    let foundRun = -1;
    let foundExpected = -1;

    for (
      let e = expectedIdx;
      e <= Math.min(descent.length - 1, expectedIdx + DESCENT_INTENT_MAX_SKIP);
      e++
    ) {
      for (let r = runIdx; r <= searchEnd; r++) {
        if (runMatchesMidi(after[r]!, descent[e]!)) {
          foundRun = r;
          foundExpected = e;
          break;
        }
      }
      if (foundRun >= 0) break;
    }

    if (foundRun < 0 || foundExpected < 0) break;
    matched += 1;
    runIdx = foundRun + 1;
    expectedIdx = foundExpected + 1;
  }

  return matched;
}

/**
 * True when the take reached the top of the scale and then played several
 * notes consistent with the expected descending leg.
 */
export function detectScaleDescentIntent(
  runs: readonly MidiHint[] | readonly StablePitchRun[],
  ascendingMidis: readonly number[],
  opts?: { minNotes?: number },
): boolean {
  const minNotes = opts?.minNotes ?? DESCENT_INTENT_MIN_NOTES;
  const peakRun = findPeakRunIndex(runs, ascendingMidis);
  if (peakRun < 0) return false;
  return (
    countDescendingMatchesAfterPeak(runs, ascendingMidis, peakRun) >= minNotes
  );
}

export type ResolvedScaleExercise = {
  expectedMidis: number[];
  motion: ScaleExerciseMotion;
  /** True when we expanded ascending-only into ascending + descending. */
  upgradedToRoundTrip: boolean;
};

/**
 * Choose the expected MIDI sequence for a take. If the student started an
 * ascending exercise but clearly began descending after the peak, expand to
 * the full ascending + descending pattern so missed descent notes are scored.
 */
export function resolveScaleExerciseMidis(input: {
  rootMidi: number;
  scaleKind: ScaleKind;
  octaveSpan: 1 | 2;
  runs: readonly MidiHint[] | readonly StablePitchRun[];
  /** Preferred motion when descent intent is not clear. Defaults to ascending. */
  preferredMotion?: ScaleExerciseMotion;
}): ResolvedScaleExercise {
  const ascending = buildAscendingScaleMidis(
    input.rootMidi,
    input.scaleKind,
    input.octaveSpan,
  );
  const roundTrip = buildExerciseScaleMidis(
    input.rootMidi,
    input.scaleKind,
    input.octaveSpan,
  );
  const preferred = input.preferredMotion ?? "ascending";

  if (preferred === "up_down" || preferred === "descending") {
    return {
      expectedMidis:
        preferred === "descending"
          ? ascending.slice().reverse()
          : roundTrip,
      motion: preferred,
      upgradedToRoundTrip: false,
    };
  }

  if (detectScaleDescentIntent(input.runs, ascending)) {
    return {
      expectedMidis: roundTrip,
      motion: "up_down",
      upgradedToRoundTrip: true,
    };
  }

  return {
    expectedMidis: ascending,
    motion: "ascending",
    upgradedToRoundTrip: false,
  };
}

/** True when `expectedMidis` is already an ascending + descending exercise. */
export function expectedLooksRoundTrip(
  expectedMidis: readonly number[],
): boolean {
  const n = expectedMidis.length;
  return n >= 3 && expectedMidis[0] === expectedMidis[n - 1];
}
