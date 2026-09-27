import { preferredTonicOption, type ScaleKind } from "@/lib/scales";
import { CLEF_STAFF } from "@/lib/instrument/notation";
import type { NotationClef } from "@/lib/instrument/types";

const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_STEP: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

const NATURAL_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** VexFlow major key names preferring flats (Db not C#). */
const MAJOR_FLAT_BY_PC = [
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
  "Cb",
] as const;

/** VexFlow major key names preferring sharps (F# not Gb). */
const MAJOR_SHARP_BY_PC = [
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

export const VEX_KEY_MAJOR: readonly string[] = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

function toVexKeyName(label: string): string {
  return label.replaceAll("♯", "#").replaceAll("♭", "b");
}

function tonicLetterForWalk(tonicPitchClass: number, kind: ScaleKind): string {
  const label = preferredTonicOption(tonicPitchClass, kind).label;
  return label.match(/[A-G]/i)?.[0]?.toUpperCase() ?? "C";
}

/**
 * Major: the sidebar spelling. Minor: relative major with the same sharp/flat side
 * (E♭ minor → Gb, G♯ minor → B) so the key signature matches the notes.
 */
export function vexKeySignatureSpec(
  tonicPitchClass: number,
  kind: ScaleKind,
): string {
  const pc = ((tonicPitchClass % 12) + 12) % 12;
  if (kind === "major") {
    return toVexKeyName(preferredTonicOption(pc, "major").label);
  }
  const minor = preferredTonicOption(pc, "natural_minor");
  const rel = (pc + 3) % 12;
  if (minor.accidentalKind === "flat") return MAJOR_FLAT_BY_PC[rel]!;
  if (minor.accidentalKind === "sharp") return MAJOR_SHARP_BY_PC[rel]!;
  return "C";
}

/**
 * Map staff letter + target MIDI to VexFlow key (`c#/4`).
 * Octave follows the *written letter*, so B3 as C♭ is `cb/4`, not `cb/3`.
 */
export function letterAndMidiToVexKey(letter: string, targetMidi: number): string {
  const L = letter.toUpperCase();
  const nat = NATURAL_PC[L];
  if (nat === undefined) {
    return `c/${Math.floor(targetMidi / 12) - 1}`;
  }
  const targetPc = ((targetMidi % 12) + 12) % 12;
  const diff = (targetPc - nat + 12) % 12;
  let acc = "";
  let accSemis = 0;
  if (diff === 0) {
    acc = "";
    accSemis = 0;
  } else if (diff === 1) {
    acc = "#";
    accSemis = 1;
  } else if (diff === 11) {
    acc = "b";
    accSemis = -1;
  } else if (diff === 2) {
    acc = "##";
    accSemis = 2;
  } else if (diff === 10) {
    acc = "bb";
    accSemis = -2;
  } else if (diff === 3) {
    acc = "###";
    accSemis = 3;
  } else if (diff === 9) {
    acc = "bbb";
    accSemis = -3;
  } else if (diff < 6) {
    acc = "#";
    accSemis = 1;
  } else {
    acc = "b";
    accSemis = -1;
  }

  const naturalMidi = targetMidi - accSemis;
  const octave = Math.floor(naturalMidi / 12) - 1;
  return `${L.toLowerCase()}${acc}/${octave}`;
}

/**
 * Diatonic spellings for ascending scale degrees (matches `ascendingMidis` order).
 */
export function spellAscendingMidisToVexKeys(
  ascendingMidis: number[],
  tonicPitchClass: number,
  kind: ScaleKind,
): string[] {
  const rootLetter = tonicLetterForWalk(tonicPitchClass, kind);
  const startIdx = LETTER_ORDER.indexOf(rootLetter as (typeof LETTER_ORDER)[number]);
  if (startIdx < 0) {
    return ascendingMidis.map((m) => letterAndMidiToVexKey("C", m));
  }
  return ascendingMidis.map((midi, i) => {
    const letter = LETTER_ORDER[(startIdx + i) % 7]!;
    return letterAndMidiToVexKey(letter, midi);
  });
}

export function buildMidiToVexKeyMap(
  ascendingMidis: number[],
  tonicPitchClass: number,
  kind: ScaleKind,
): Map<number, string> {
  const keys = spellAscendingMidisToVexKeys(
    ascendingMidis,
    tonicPitchClass,
    kind,
  );
  const map = new Map<number, string>();
  ascendingMidis.forEach((m, i) => {
    if (!map.has(m)) map.set(m, keys[i]!);
  });
  return map;
}

export function vexKeysForMidisOrdered(
  midis: number[],
  midiToKey: Map<number, string>,
  tonicPitchClass: number,
  kind: ScaleKind,
): string[] {
  const rootLetter = tonicLetterForWalk(tonicPitchClass, kind);
  return midis.map((m) => {
    const hit = midiToKey.get(m);
    if (hit) return hit;
    return letterAndMidiToVexKey(rootLetter, m);
  });
}

/** Diatonic staff steps from C0 (C4 = 28). Accidentals stay on the same letter. */
export function staffStepFromVexKey(key: string): number {
  const m = key.match(/^([a-g])(#{1,3}|b{1,3})?\/(-?\d+)$/i);
  if (!m) return 28;
  const letter = m[1]!.toUpperCase();
  const oct = Number(m[3]);
  return oct * 7 + (LETTER_STEP[letter] ?? 0);
}

export const STAVE_LINE_SPACING_PX = 17;
/** VexFlow `Stave` y is the top staff line when these are 0. */
export const STAVE_HEADROOM_SPACES = 0;

const STAVE_PAD_PX = 16;
const STEM_SPACES = 4;
const NOTEHEAD_SPACES = 0.55;
/** Treble G-clef ink above/below the staff (staff spaces). */
const TREBLE_CLEF_ABOVE_SPACES = 2.55;
const TREBLE_CLEF_BELOW_SPACES = 2.85;
/** Alto C-clef ink above/below the staff (staff spaces). */
const ALTO_CLEF_ABOVE_SPACES = 2.15;
const ALTO_CLEF_BELOW_SPACES = 2.15;
const BASS_CLEF_ABOVE_SPACES = 2.15;
const BASS_CLEF_BELOW_SPACES = 2.85;
/** VexFlow’s default staff spacing; used to scale clef point size. */
export const VEX_DEFAULT_LINE_SPACING_PX = 10;
/** VexFlow default clef point size when size === "default". */
export const VEX_DEFAULT_CLEF_POINT = 30;

/**
 * Clef font size matched to custom `spacingBetweenLinesPx`.
 * Treble and alto share the same point scale — VexFlow’s C-clef already
 * sits correctly on the staff without an extra boost.
 */
export function clefPointForLineSpacing(
  lineSpacingPx: number,
  noteHeadFontSize?: number,
  _clef: NotationClef = "treble",
): number {
  void _clef;
  const fromSpacing =
    VEX_DEFAULT_CLEF_POINT * (lineSpacingPx / VEX_DEFAULT_LINE_SPACING_PX);
  const fromHeads =
    noteHeadFontSize != null
      ? noteHeadFontSize * (VEX_DEFAULT_CLEF_POINT / 33)
      : fromSpacing;
  return Math.round(Math.max(12, fromSpacing, fromHeads));
}

/**
 * Key-list chip clef — sized to fill the five-line staff (≈ engraving
 * 3× spacing), not the undersized 2.15× that left C-/G-clefs looking tiny.
 */
export function keySignatureMiniClefPoint(lineSpacingPx: number): number {
  return Math.round(Math.max(12, Math.min(20, lineSpacingPx * 2.9)));
}

/**
 * Key-list accidentals — a little over 2× a staff space so sharps and flats
 * read clearly, still under the clef (default VexFlow 30pt overflows the chip).
 */
export function keySignatureMiniAccidentalPoint(lineSpacingPx: number): number {
  return Math.round(Math.max(12, Math.min(15, lineSpacingPx * 2.75)));
}

/**
 * Vertical ink of the staff + notes (ledgers, stems, clef), relative to the
 * top staff line. Used so the box hugs the notation with equal padding.
 */
export function notationInkRelativeToTopLine(
  vexKeys: string[],
  spacingPx = STAVE_LINE_SPACING_PX,
  clef: NotationClef = "treble",
): { top: number; bottom: number } {
  const geo = CLEF_STAFF[clef];
  const pxPerStep = spacingPx / 2;
  const staffBottom = 4 * spacingPx;
  const above =
    clef === "alto"
      ? ALTO_CLEF_ABOVE_SPACES
      : clef === "bass"
        ? BASS_CLEF_ABOVE_SPACES
        : TREBLE_CLEF_ABOVE_SPACES;
  const below =
    clef === "alto"
      ? ALTO_CLEF_BELOW_SPACES
      : clef === "bass"
        ? BASS_CLEF_BELOW_SPACES
        : TREBLE_CLEF_BELOW_SPACES;
  let top = -above * spacingPx;
  let bottom = staffBottom + below * spacingPx;

  const steps =
    vexKeys.length > 0 ? vexKeys.map(staffStepFromVexKey) : [geo.bottomStep];
  const headR = NOTEHEAD_SPACES * spacingPx;
  const stemLen = STEM_SPACES * spacingPx;

  for (const step of steps) {
    const y = (geo.topStep - step) * pxPerStep;
    top = Math.min(top, y - headR);
    bottom = Math.max(bottom, y + headR);
    if (step < geo.midStep) {
      top = Math.min(top, y - stemLen);
    } else {
      bottom = Math.max(bottom, y + stemLen);
    }
  }

  return { top, bottom };
}

/**
 * Size the SVG so notation sits in the middle with the same gap above and below.
 * Extra height only comes from notes that leave the five lines.
 */
export function staveCanvasMetrics(
  vexKeys: string[],
  spacingPx = STAVE_LINE_SPACING_PX,
  clef: NotationClef = "treble",
): { height: number; staveY: number } {
  const { top, bottom } = notationInkRelativeToTopLine(vexKeys, spacingPx, clef);
  const height = Math.ceil(bottom - top + 2 * STAVE_PAD_PX);
  const staveY = Math.ceil(STAVE_PAD_PX - top);
  return { height, staveY };
}
