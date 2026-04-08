import {
  formatNoteLabel,
  isViolinRangeMidi,
  midiFromOctavePitch,
  splitMidi,
  VIOLIN_MIDI_MAX,
  VIOLIN_MIDI_MIN,
} from "@/lib/intonation";

export type ScaleKind = "major" | "natural_minor";

/** Semitone offsets from the tonic within one octave, including the octave duplicate. */
const MAJOR_OCTAVE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const;
const NATURAL_MINOR_OCTAVE_OFFSETS = [0, 2, 3, 5, 7, 8, 10, 12] as const;

export function scaleOctaveOffsets(kind: ScaleKind): readonly number[] {
  return kind === "major" ? MAJOR_OCTAVE_OFFSETS : NATURAL_MINOR_OCTAVE_OFFSETS;
}

/**
 * Ascending scale MIDI notes: one octave = 8 notes (tonic to tonic);
 * two octaves = 15 notes (tonic through upper tonic).
 */
export function buildAscendingScaleMidis(
  rootMidi: number,
  kind: ScaleKind,
  octaveSpan: 1 | 2,
): number[] {
  const pat = scaleOctaveOffsets(kind);
  const out: number[] = [];
  for (let o = 0; o < octaveSpan; o++) {
    const octaveBase = rootMidi + o * 12;
    const segment: readonly number[] = o === 0 ? pat : pat.slice(1);
    for (const inc of segment) {
      out.push(o === 0 ? rootMidi + inc : octaveBase + inc);
    }
  }
  return out;
}

/**
 * Full guided exercise: ascend to the top tonic, then descend back to the starting note
 * (peak note is not repeated at the turnaround).
 */
export function buildExerciseScaleMidis(
  rootMidi: number,
  kind: ScaleKind,
  octaveSpan: 1 | 2,
): number[] {
  const up = buildAscendingScaleMidis(rootMidi, kind, octaveSpan);
  if (up.length <= 1) return up;
  const down = up.slice(0, -1).reverse();
  return [...up, ...down];
}

/** Stable id for storage / future AI routing, e.g. `G_major`, `Bb_natural_minor`. */
export function scaleIdFor(tonicPitchClass: number, kind: ScaleKind): string {
  const names = [
    "C",
    "Db",
    "D",
    "Eb",
    "E",
    "F",
    "Gb",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ] as const;
  const t = names[((tonicPitchClass % 12) + 12) % 12];
  const k = kind === "major" ? "major" : "natural_minor";
  return `${t}_${k}`;
}

export function scaleDisplayLabel(tonicPitchClass: number, kind: ScaleKind): string {
  const names = [
    "C",
    "D♭",
    "D",
    "E♭",
    "E",
    "F",
    "G♭",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ] as const;
  const t = names[((tonicPitchClass % 12) + 12) % 12];
  return kind === "major" ? `${t} major` : `${t} natural minor`;
}

export function octaveRangeLabel(lowMidi: number, highMidi: number): string {
  return `${formatNoteLabel(lowMidi)}–${formatNoteLabel(highMidi)}`;
}

/** Violin-range MIDI candidates that match this tonic (any octave). */
export function violinRootsForTonic(tonicPitchClass: number): number[] {
  const out: number[] = [];
  for (let m = VIOLIN_MIDI_MIN; m <= VIOLIN_MIDI_MAX; m++) {
    if (((m % 12) + 12) % 12 === ((tonicPitchClass % 12) + 12) % 12) {
      out.push(m);
    }
  }
  return out;
}

/**
 * Pick a default root in violin range for the tonic (prefers D-string neighbourhood).
 */
export function defaultRootMidiForTonic(tonicPitchClass: number): number {
  const roots = violinRootsForTonic(tonicPitchClass);
  if (roots.length === 0) return VIOLIN_MIDI_MIN;
  const prefer = midiFromOctavePitch(3, tonicPitchClass);
  let best = roots[0]!;
  let bestDist = 999;
  for (const r of roots) {
    const d = Math.abs(r - prefer);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}

export function validateScaleMidisInViolinRange(midis: number[]): boolean {
  return midis.every((m) => isViolinRangeMidi(m));
}

export function pitchClassName(pitchClass: number): string {
  const names = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ] as const;
  return names[((pitchClass % 12) + 12) % 12];
}

export function tonicOptionsForViolin(): { pitchClass: number; label: string }[] {
  const seen = new Set<number>();
  const out: { pitchClass: number; label: string }[] = [];
  for (let m = VIOLIN_MIDI_MIN; m <= VIOLIN_MIDI_MAX; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (seen.has(pc)) continue;
    seen.add(pc);
    out.push({ pitchClass: pc, label: pitchClassName(pc) });
  }
  out.sort((a, b) => a.pitchClass - b.pitchClass);
  return out;
}

export function describeRootChoice(rootMidi: number): string {
  const { octave } = splitMidi(rootMidi);
  return `${formatNoteLabel(rootMidi)} (oct. ${octave})`;
}
