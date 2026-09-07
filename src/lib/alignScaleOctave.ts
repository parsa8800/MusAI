import { formatNoteLabel } from "@/lib/intonation";
import { VIOLIN_MIDI_MAX, VIOLIN_MIDI_MIN } from "@/lib/intonation";
import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";

type DetectedNoteOctaveHint = {
  detectedMidi: number;
  missingData: boolean;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function shiftFitsViolinRange(
  expectedMidis: readonly number[],
  k: number,
): boolean {
  return expectedMidis.every((m) => {
    const shifted = m + 12 * k;
    return shifted >= VIOLIN_MIDI_MIN && shifted <= VIOLIN_MIDI_MAX;
  });
}

/**
 * Choose octave shift (in 12-semitone steps) that places expected midis
 * nearest the pitches actually detected — without leaping to absurd highs
 * from harmonics / noisy pitch.
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

  const expectedMedian = median(pairs.map((p) => p.e));
  const detectedMedian = median(pairs.map((p) => p.d));
  if (expectedMedian == null || detectedMedian == null) return 0;

  type Candidate = { k: number; cost: number };
  const candidates: Candidate[] = [];
  for (let k = -3; k <= 2; k++) {
    if (!shiftFitsViolinRange(expectedMidis, k)) continue;
    let cost = 0;
    for (const p of pairs) {
      cost += Math.abs(p.e + 12 * k - p.d);
    }
    candidates.push({ k, cost });
  }
  if (candidates.length === 0) return 0;

  candidates.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    // Prefer staying put, then prefer lower octaves (avoid harmonic jumps up).
    if (Math.abs(a.k) !== Math.abs(b.k)) return Math.abs(a.k) - Math.abs(b.k);
    return a.k - b.k;
  });

  const best = candidates[0]!;
  const zero = candidates.find((c) => c.k === 0);
  // Stay on the written octave unless another octave is clearly better.
  const avgMargin = pairs.length * 4;
  if (zero && best.k !== 0 && best.cost + avgMargin >= zero.cost) {
    return 0;
  }

  // Only shift UP when the median detected pitch is clearly above the written scale.
  if (best.k > 0 && detectedMedian < expectedMedian + 6) {
    return zero?.k ?? 0;
  }

  return best.k;
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

/** Split session notes into ascending/descending cents for staff colouring. */
export function staffFeedbackFromSession(session: {
  expectedNotesMidi: number[];
  notes: Array<{
    detectedMidi: number;
    missingData: boolean;
    centsDifference: number;
  }>;
}): {
  displayMidis: number[];
  ascendingCents: (number | null)[];
  descendingCents: (number | null)[];
} {
  const displayMidis = alignExpectedMidisToDetectedOctave(
    session.expectedNotesMidi,
    session.notes,
  );
  const n = displayMidis.length;
  const looksRoundTrip = n >= 3 && displayMidis[0] === displayMidis[n - 1];
  const ascendingSteps = looksRoundTrip ? (n + 1) / 2 : n;
  const ascNotes = session.notes.slice(0, ascendingSteps);
  const descNotes = looksRoundTrip
    ? session.notes.slice(ascendingSteps)
    : [];
  return {
    displayMidis,
    ascendingCents: ascNotes.map((r) =>
      r.missingData ? null : r.centsDifference,
    ),
    descendingCents: descNotes.map((r) =>
      r.missingData ? null : r.centsDifference,
    ),
  };
}
