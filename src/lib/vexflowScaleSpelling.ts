import type { ScaleKind } from "@/lib/scales";

const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;

const NATURAL_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Major key roots as used for VexFlow `setKeySignature` (circle-of-fifths spelling). */
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

/**
 * Natural-minor tonic spelling by pitch class (index 0 = C, … 11 = B).
 * Used only to find the diatonic letter sequence; key signature uses relative major.
 */
const MINOR_ROOT_BY_PC: readonly string[] = [
  "C",
  "C#",
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

export function vexKeySignatureSpec(
  tonicPitchClass: number,
  kind: ScaleKind,
): string {
  if (kind === "major") {
    return VEX_KEY_MAJOR[((tonicPitchClass % 12) + 12) % 12]!;
  }
  const relMaj = (tonicPitchClass + 3) % 12;
  return VEX_KEY_MAJOR[((relMaj % 12) + 12) % 12]!;
}

function tonicLetterForWalk(tonicPitchClass: number, kind: ScaleKind): string {
  if (kind === "major") {
    const s = VEX_KEY_MAJOR[((tonicPitchClass % 12) + 12) % 12]!;
    return s.match(/^([A-G])/)![1]!;
  }
  const s = MINOR_ROOT_BY_PC[((tonicPitchClass % 12) + 12) % 12]!;
  return s.match(/^([A-G])/)![1]!;
}

/**
 * Map staff letter + target MIDI to VexFlow key (`c#/4`).
 */
export function letterAndMidiToVexKey(letter: string, targetMidi: number): string {
  const targetPc = ((targetMidi % 12) + 12) % 12;
  const nat = NATURAL_PC[letter];
  if (nat === undefined) {
    return `c/${Math.floor(targetMidi / 12) - 1}`;
  }
  const diff = (targetPc - nat + 12) % 12;
  let acc = "";
  if (diff === 0) acc = "";
  else if (diff === 1) acc = "#";
  else if (diff === 11) acc = "b";
  else if (diff === 2) acc = "##";
  else if (diff === 10) acc = "bb";
  else if (diff === 3) acc = "###";
  else if (diff === 9) acc = "bbb";
  else acc = diff < 6 ? "#" : "b";
  const octave = Math.floor(targetMidi / 12) - 1;
  return `${letter.toLowerCase()}${acc}/${octave}`;
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
