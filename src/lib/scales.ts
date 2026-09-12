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

/** Supported exercise directions. Peak tonic is not doubled on up+down. */
export type ScaleExerciseMotion = "ascending" | "descending" | "up_down";

/** Scale degrees in one octave, excluding the repeated tonic (major/minor = 7). */
export function scaleStepsPerOctave(kind: ScaleKind): number {
  return scaleOctaveOffsets(kind).length - 1;
}

/**
 * Expected note count for a constructed exercise.
 * Derived from the scale pattern, octave span, and motion — never a hardcoded 8 or 15.
 */
export function expectedScaleNoteCount(
  octaveSpan: 1 | 2,
  motion: ScaleExerciseMotion,
  kind: ScaleKind = "major",
): number {
  const oneWay = scaleStepsPerOctave(kind) * octaveSpan + 1;
  if (motion === "up_down") return oneWay * 2 - 1;
  return oneWay;
}

/**
 * Ascending scale MIDI notes from tonic to the top tonic.
 * Length is `scaleStepsPerOctave(kind) * octaveSpan + 1` (the extra note is the upper tonic).
 * The mid tonic on a 2-octave span is not duplicated.
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

/** Descending scale: reverse of the ascending run (top tonic first, starting tonic last). */
export function buildDescendingScaleMidis(
  rootMidi: number,
  kind: ScaleKind,
  octaveSpan: 1 | 2,
): number[] {
  return buildAscendingScaleMidis(rootMidi, kind, octaveSpan).slice().reverse();
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

/** Expected MIDI sequence for any supported scale construction. */
export function buildScaleExerciseMidis(
  rootMidi: number,
  kind: ScaleKind,
  octaveSpan: 1 | 2,
  motion: ScaleExerciseMotion,
): number[] {
  if (motion === "ascending") {
    return buildAscendingScaleMidis(rootMidi, kind, octaveSpan);
  }
  if (motion === "descending") {
    return buildDescendingScaleMidis(rootMidi, kind, octaveSpan);
  }
  return buildExerciseScaleMidis(rootMidi, kind, octaveSpan);
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
  const t = preferredTonicOption(tonicPitchClass, kind).label;
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
 * Pick a default root in violin range for the tonic.
 * Prefers the first octave around C4 (MIDI 60 neighbourhood) — not high starts.
 */
export function defaultRootMidiForTonic(tonicPitchClass: number): number {
  const roots = violinRootsForTonic(tonicPitchClass);
  if (roots.length === 0) return VIOLIN_MIDI_MIN;
  const prefer = midiFromOctavePitch(4, tonicPitchClass);
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

export type TonicAccidentalKind = "natural" | "sharp" | "flat";

export type TonicAccidentalOption = {
  pitchClass: number;
  label: string;
  accidentalCount: number;
  accidentalKind: TonicAccidentalKind;
};

/** Circle-of-fifths order — same placement order as a printed treble key signature. */
export const SHARP_SIGNATURE_ORDER = [
  "F♯",
  "C♯",
  "G♯",
  "D♯",
  "A♯",
  "E♯",
] as const;
export const FLAT_SIGNATURE_ORDER = [
  "B♭",
  "E♭",
  "A♭",
  "D♭",
  "G♭",
  "C♭",
] as const;

export type KeySignatureSummary = {
  pitchClass: number;
  label: string;
  displayName: string;
  accidentalKind: TonicAccidentalKind;
  accidentalCount: number;
  accidentalNames: string[];
  /** “No sharps or flats”, “2 sharps”, “1 flat”. */
  countLabel: string;
  /** “F♯ C♯”, empty when there are none. */
  namesLabel: string;
  /** Subtle match hint: “No accidentals”, “Music with 2 sharps”. */
  matchHint: string;
};

export type TonicAccidentalRow = {
  accidentalCount: number;
  keys: TonicAccidentalOption[];
};

function tonicKey(
  pitchClass: number,
  label: string,
  accidentalCount: number,
  accidentalKind: TonicAccidentalKind,
): TonicAccidentalOption {
  return { pitchClass, label, accidentalCount, accidentalKind };
}

/** Major: C, then F/G, B♭/D… (flats left, sharps right). Minor uses the same signatures. */
const MAJOR_ACCIDENTAL_ROWS: TonicAccidentalRow[] = [
  { accidentalCount: 0, keys: [tonicKey(0, "C", 0, "natural")] },
  {
    accidentalCount: 1,
    keys: [tonicKey(5, "F", 1, "flat"), tonicKey(7, "G", 1, "sharp")],
  },
  {
    accidentalCount: 2,
    keys: [tonicKey(10, "B♭", 2, "flat"), tonicKey(2, "D", 2, "sharp")],
  },
  {
    accidentalCount: 3,
    keys: [tonicKey(3, "E♭", 3, "flat"), tonicKey(9, "A", 3, "sharp")],
  },
  {
    accidentalCount: 4,
    keys: [tonicKey(8, "A♭", 4, "flat"), tonicKey(4, "E", 4, "sharp")],
  },
  {
    accidentalCount: 5,
    keys: [tonicKey(1, "D♭", 5, "flat"), tonicKey(11, "B", 5, "sharp")],
  },
  { accidentalCount: 6, keys: [tonicKey(6, "F♯", 6, "sharp")] },
];

const MINOR_ACCIDENTAL_ROWS: TonicAccidentalRow[] = [
  { accidentalCount: 0, keys: [tonicKey(9, "A", 0, "natural")] },
  {
    accidentalCount: 1,
    keys: [tonicKey(2, "D", 1, "flat"), tonicKey(4, "E", 1, "sharp")],
  },
  {
    accidentalCount: 2,
    keys: [tonicKey(7, "G", 2, "flat"), tonicKey(11, "B", 2, "sharp")],
  },
  {
    accidentalCount: 3,
    keys: [tonicKey(0, "C", 3, "flat"), tonicKey(6, "F♯", 3, "sharp")],
  },
  {
    accidentalCount: 4,
    keys: [tonicKey(5, "F", 4, "flat"), tonicKey(1, "C♯", 4, "sharp")],
  },
  {
    accidentalCount: 5,
    keys: [tonicKey(10, "B♭", 5, "flat"), tonicKey(8, "G♯", 5, "sharp")],
  },
  { accidentalCount: 6, keys: [tonicKey(3, "E♭", 6, "flat")] },
];

export function tonicAccidentalRows(kind: ScaleKind): TonicAccidentalRow[] {
  return kind === "major" ? MAJOR_ACCIDENTAL_ROWS : MINOR_ACCIDENTAL_ROWS;
}

export function accidentalNames(option: TonicAccidentalOption): string[] {
  if (option.accidentalKind === "natural" || option.accidentalCount <= 0) {
    return [];
  }
  const n = Math.min(option.accidentalCount, 6);
  const order =
    option.accidentalKind === "sharp"
      ? SHARP_SIGNATURE_ORDER
      : FLAT_SIGNATURE_ORDER;
  return [...order.slice(0, n)];
}

export function accidentalNamesLabel(option: TonicAccidentalOption): string {
  return accidentalNames(option).join(" ");
}

/** Short key-signature hint under each tonic letter in the sidebar. */
export function accidentalBadge(option: TonicAccidentalOption): string {
  if (option.accidentalKind === "natural" || option.accidentalCount === 0) {
    return "No sharps or flats";
  }
  const n = option.accidentalCount;
  if (option.accidentalKind === "sharp") {
    return n === 1 ? "1 sharp" : `${n} sharps`;
  }
  return n === 1 ? "1 flat" : `${n} flats`;
}

export function keySignatureMatchHint(option: TonicAccidentalOption): string {
  if (option.accidentalKind === "natural" || option.accidentalCount === 0) {
    return "No accidentals";
  }
  return `Music with ${accidentalBadge(option)}`;
}

export function keySignatureSummary(
  option: TonicAccidentalOption,
  kind: ScaleKind,
): KeySignatureSummary {
  const quality = kind === "major" ? "major" : "minor";
  return {
    pitchClass: option.pitchClass,
    label: option.label,
    displayName: `${option.label} ${quality}`,
    accidentalKind: option.accidentalKind,
    accidentalCount: option.accidentalCount,
    accidentalNames: accidentalNames(option),
    countLabel: accidentalBadge(option),
    namesLabel: accidentalNamesLabel(option),
    matchHint: keySignatureMatchHint(option),
  };
}

/** Compact ♯/♭ marks for the sidebar chip (visual scan). */
export function accidentalMarks(option: TonicAccidentalOption): string {
  if (option.accidentalKind === "natural" || option.accidentalCount === 0) {
    return "♮";
  }
  const mark = option.accidentalKind === "sharp" ? "♯" : "♭";
  const n = Math.min(option.accidentalCount, 6);
  return mark.repeat(n);
}

/** Count + mark for pickers: ♮, 1♭, 2♯ — not a stack of accidentals. */
export function accidentalCountLabel(option: TonicAccidentalOption): string {
  if (option.accidentalKind === "natural" || option.accidentalCount === 0) {
    return "♮";
  }
  const mark = option.accidentalKind === "sharp" ? "♯" : "♭";
  return `${Math.min(option.accidentalCount, 6)}${mark}`;
}

/** Sidebar spelling for this tonic (G♯ minor, not A♭ minor). */
export function preferredTonicOption(
  pitchClass: number,
  kind: ScaleKind,
): TonicAccidentalOption {
  const pc = ((pitchClass % 12) + 12) % 12;
  for (const row of tonicAccidentalRows(kind)) {
    const hit = row.keys.find((k) => k.pitchClass === pc);
    if (hit) return hit;
  }
  return tonicKey(pc, pitchClassName(pc), 0, "natural");
}

export function describeRootChoice(rootMidi: number): string {
  const { octave } = splitMidi(rootMidi);
  return `${formatNoteLabel(rootMidi)} (oct. ${octave})`;
}
