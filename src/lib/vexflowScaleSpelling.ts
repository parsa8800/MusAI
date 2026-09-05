import { preferredTonicOption, type ScaleKind } from "@/lib/scales";

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

const TREBLE_BOTTOM_STEP = 4 * 7 + 2; // E4
const TREBLE_TOP_STEP = 5 * 7 + 3; // F5
const TREBLE_MID_STEP = 4 * 7 + 6; // B4

export const STAVE_LINE_SPACING_PX = 17;
/** VexFlow `Stave` y is the top staff line when these are 0. */
export const STAVE_HEADROOM_SPACES = 0;

const STAVE_PAD_PX = 16;
const STEM_SPACES = 4;
const NOTEHEAD_SPACES = 0.55;
const CLEF_ABOVE_SPACES = 1.2;
const CLEF_BELOW_SPACES = 1.75;

/**
 * Vertical ink of the staff + notes (ledgers, stems, clef), relative to the
 * top staff line. Used so the box hugs the notation with equal padding.
 */
export function notationInkRelativeToTopLine(
  vexKeys: string[],
  spacingPx = STAVE_LINE_SPACING_PX,
): { top: number; bottom: number } {
  const pxPerStep = spacingPx / 2;
  const staffBottom = 4 * spacingPx;
  let top = -CLEF_ABOVE_SPACES * spacingPx;
  let bottom = staffBottom + CLEF_BELOW_SPACES * spacingPx;

  const steps =
    vexKeys.length > 0 ? vexKeys.map(staffStepFromVexKey) : [TREBLE_BOTTOM_STEP];
  const headR = NOTEHEAD_SPACES * spacingPx;
  const stemLen = STEM_SPACES * spacingPx;

  for (const step of steps) {
    const y = (TREBLE_TOP_STEP - step) * pxPerStep;
    top = Math.min(top, y - headR);
    bottom = Math.max(bottom, y + headR);
    if (step < TREBLE_MID_STEP) {
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
): { height: number; staveY: number } {
  const { top, bottom } = notationInkRelativeToTopLine(vexKeys, spacingPx);
  const height = Math.ceil(bottom - top + 2 * STAVE_PAD_PX);
  const staveY = Math.ceil(STAVE_PAD_PX - top);
  return { height, staveY };
}
