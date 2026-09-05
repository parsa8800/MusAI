import {
  nearestMidiOfPitchClass,
  SCALE_CLEAR_MISS_CENTS,
  SCALE_IN_TUNE_CENTS,
  scoreForAbsCents,
  unwrapOctaveCents,
} from "@/lib/intonationScore";

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export function formatNoteLabel(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${n}${octave}`;
}

/** Violin-friendly range: G3 (55) through E7 (100). */
export const VIOLIN_MIDI_MIN = 55;
export const VIOLIN_MIDI_MAX = 100;

export function violinNoteOptions(): { midi: number; label: string }[] {
  const out: { midi: number; label: string }[] = [];
  for (let m = VIOLIN_MIDI_MIN; m <= VIOLIN_MIDI_MAX; m++) {
    out.push({ midi: m, label: formatNoteLabel(m) });
  }
  return out;
}

export function pitchClassLabel(pitchClass: number): string {
  return NOTE_NAMES[((pitchClass % 12) + 12) % 12];
}

/** Scientific octave (e.g. A4) + pitch class → MIDI. */
export function midiFromOctavePitch(
  octave: number,
  pitchClass: number,
): number {
  return (octave + 1) * 12 + pitchClass;
}

export function splitMidi(midi: number): {
  octave: number;
  pitchClass: number;
} {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { octave, pitchClass };
}

export function isViolinRangeMidi(midi: number): boolean {
  return midi >= VIOLIN_MIDI_MIN && midi <= VIOLIN_MIDI_MAX;
}

/** Pitch classes (0–11) that exist in the violin range for this octave. */
export function validPitchClassesInOctave(octave: number): number[] {
  const pcs: number[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const m = midiFromOctavePitch(octave, pc);
    if (isViolinRangeMidi(m)) pcs.push(pc);
  }
  return pcs;
}

/**
 * After changing octave, pick a valid MIDI closest in pitch-class space to
 * `preferredPitchClass`.
 */
export function nearestViolinMidiInOctave(
  octave: number,
  preferredPitchClass: number,
): number {
  const valid = validPitchClassesInOctave(octave);
  if (valid.length === 0) return VIOLIN_MIDI_MIN;
  let best = valid[0]!;
  let bestDist = 99;
  for (const pc of valid) {
    const d = Math.min(
      Math.abs(pc - preferredPitchClass),
      12 - Math.abs(pc - preferredPitchClass),
    );
    if (d < bestDist) {
      bestDist = d;
      best = pc;
    }
  }
  return midiFromOctavePitch(octave, best);
}

/** Lowest / highest scientific octave that still has at least one in-range note. */
export function violinOctaveBounds(): { min: number; max: number } {
  return {
    min: splitMidi(VIOLIN_MIDI_MIN).octave,
    max: splitMidi(VIOLIN_MIDI_MAX).octave,
  };
}

/** In-range MIDI with this pitch class, closest to `preferMidi`. */
export function nearestViolinMidiWithPitchClass(
  pitchClass: number,
  preferMidi: number,
): number {
  const candidates: number[] = [];
  for (let m = VIOLIN_MIDI_MIN; m <= VIOLIN_MIDI_MAX; m++) {
    if (((m % 12) + 12) % 12 === pitchClass) candidates.push(m);
  }
  if (candidates.length === 0) return VIOLIN_MIDI_MIN;
  let best = candidates[0]!;
  let bestDist = Math.abs(best - preferMidi);
  for (const c of candidates) {
    const d = Math.abs(c - preferMidi);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * One chromatic semitone toward `newPitchClass` on the ring, or null if that step is
 * outside the violin range. Uses linear MIDI (+1 / −1), so B↔C crosses octaves correctly.
 */
export function violinChromaticNeighborMidi(
  previousMidi: number,
  newPitchClass: number,
): number | null {
  const prevPc = ((previousMidi % 12) + 12) % 12;
  const deltaCW = (newPitchClass - prevPc + 12) % 12;
  if (deltaCW !== 1 && deltaCW !== 11) return null;
  const cand = deltaCW === 1 ? previousMidi + 1 : previousMidi - 1;
  const candPc = ((cand % 12) + 12) % 12;
  if (candPc !== newPitchClass) return null;
  if (isViolinRangeMidi(cand)) return cand;
  return null;
}

/**
 * Next MIDI for a ring interaction: adjacent wedges move by exactly one semitone in MIDI
 * (continuous slide across octaves at B↔C). Larger jumps pick same scientific octave then
 * snap to the nearest in-range note with that letter.
 */
export function midiForChromaticCircleStep(
  previousMidi: number,
  newPitchClass: number,
): number | null {
  const neighbor = violinChromaticNeighborMidi(previousMidi, newPitchClass);
  if (neighbor !== null) return neighbor;

  const { pitchClass: prevPc } = splitMidi(previousMidi);
  const deltaCW = (newPitchClass - prevPc + 12) % 12;
  if (deltaCW === 1 || deltaCW === 11) {
    // On the ring but outside playable range (e.g. below G3).
    return null;
  }

  const { octave: o } = splitMidi(previousMidi);
  const m = midiFromOctavePitch(o, newPitchClass);
  if (isViolinRangeMidi(m)) return m;

  return nearestViolinMidiWithPitchClass(newPitchClass, previousMidi);
}

/**
 * Signed cents: positive = played sharp vs target, negative = flat.
 * targetHz is the reference; detectedHz is what the player produced.
 */
export function centsFromTarget(detectedHz: number, targetHz: number): number {
  return (1200 * Math.log2(detectedHz / targetHz));
}

/** Score a heard pitch against the closest octave of a pitch class (A4 vs A5 is still A). */
export function matchHzToPitchClass(
  detectedHz: number,
  pitchClass: number,
): {
  targetMidi: number;
  targetHz: number;
  cents: number;
  score: number;
} {
  const targetMidi = nearestMidiOfPitchClass(detectedHz, pitchClass);
  const targetHz = midiToHz(targetMidi);
  const cents = unwrapOctaveCents(centsFromTarget(detectedHz, targetHz));
  return {
    targetMidi,
    targetHz,
    cents,
    score: scoreForAbsCents(Math.abs(cents)),
  };
}

export function intonationLabel(cents: number): string {
  const a = Math.abs(cents);
  if (a <= SCALE_IN_TUNE_CENTS) return "in tune";
  if (a <= SCALE_CLEAR_MISS_CENTS) return cents > 0 ? "slightly sharp" : "slightly flat";
  if (a <= 70) return cents > 0 ? "sharp" : "flat";
  return cents > 0 ? "very sharp" : "very flat";
}

/** 0–100 score; uses the same generous curve as scale studio, octave-wrapped. */
export function intonationScore(cents: number): number {
  return scoreForAbsCents(Math.abs(unwrapOctaveCents(cents)));
}

/** Short coaching line for the main results view (not technical). */
export function verdictSummary(label: string): string {
  switch (label) {
    case "in tune":
      return "You are very close to the target pitch. Strong center.";
    case "slightly sharp":
      return "Ease slightly flatter. You are just above the target.";
    case "slightly flat":
      return "Lift the pitch a touch. You are just under the target.";
    case "sharp":
      return "You are noticeably sharp. Check finger placement and pressure.";
    case "flat":
      return "You are noticeably flat. Aim higher or add a bit more bow speed.";
    case "very sharp":
      return "Quite sharp. Reset the note and match the target more slowly.";
    case "very flat":
      return "Quite flat. Find the pitch with a slower, steadier stroke.";
    default:
      return "Compare what you hear to your target and try once more.";
  }
}

/** Ring / accent color from intonation score (0–100). */
export function scoreAccentColor(score: number): string {
  if (score >= 85) return "#4ade80";
  if (score >= 60) return "#facc15";
  return "#fb7185";
}
