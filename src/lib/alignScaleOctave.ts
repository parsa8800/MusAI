import { formatNoteLabel } from "@/lib/intonation";
import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";

type DetectedNoteOctaveHint = {
  detectedMidi: number;
  missingData: boolean;
};

/**
 * Choose octave shift (in 12-semitone steps) that places expected midis
 * nearest the pitches actually detected in the take.
 */
export function bestOctaveShiftSemitones(
  expectedMidis: readonly number[],
  notes: readonly DetectedNoteOctaveHint[],
): number {
  const pairs: { e: number; d: number }[] = [];
  const n = Math.min(expectedMidis.length, notes.length);
  for (let i = 0; i < n; i++) {
    const note = notes[i]!;
    if (note.missingData) continue;
    pairs.push({ e: expectedMidis[i]!, d: note.detectedMidi });
  }
  if (pairs.length === 0) return 0;

  let bestK = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let k = -4; k <= 4; k++) {
    let cost = 0;
    for (const p of pairs) {
      cost += Math.abs(p.e + 12 * k - p.d);
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestK = k;
    }
  }
  return bestK;
}

export function shiftMidiSequence(
  midis: readonly number[],
  octaveShift: number,
): number[] {
  if (octaveShift === 0) return [...midis];
  return midis.map((m) => m + 12 * octaveShift);
}

/** Shift an expected scale so staff pitch matches the take’s octave. */
export function alignExpectedMidisToDetectedOctave(
  expectedMidis: readonly number[],
  notes: readonly DetectedNoteOctaveHint[],
): number[] {
  return shiftMidiSequence(
    expectedMidis,
    bestOctaveShiftSemitones(expectedMidis, notes),
  );
}

/**
 * Rewrite expected midis / labels (and root) onto the octave heard in the take.
 * Cents stay as already computed (octave-unwrapped vs the original target).
 */
export function alignAnalysisToDetectedOctave(
  expectedMidis: readonly number[],
  rootMidi: number,
  analysis: ScaleAnalysisResult,
): {
  expectedMidis: number[];
  rootMidi: number;
  analysis: ScaleAnalysisResult;
} {
  const k = bestOctaveShiftSemitones(expectedMidis, analysis.notes);
  if (k === 0) {
    return {
      expectedMidis: [...expectedMidis],
      rootMidi,
      analysis,
    };
  }

  const shifted = shiftMidiSequence(expectedMidis, k);
  const notes = analysis.notes.map((note, i) => {
    const expectedMidi = shifted[i] ?? note.expectedMidi + 12 * k;
    return {
      ...note,
      expectedMidi,
      expectedNoteLabel: formatNoteLabel(expectedMidi),
    };
  });

  return {
    expectedMidis: shifted,
    rootMidi: rootMidi + 12 * k,
    analysis: { ...analysis, notes },
  };
}
