import type { InstrumentProfile, NotationClef } from "@/lib/instrument/types";

/** Diatonic staff steps from C0. C4 = 28. */
export type ClefStaffGeometry = {
  /** Top staff line. Treble F5, alto G4. */
  topStep: number;
  /** Bottom staff line. Treble E4, alto F3. */
  bottomStep: number;
  /** Middle line — stem direction pivot. Treble B4, alto C4. */
  midStep: number;
};

export const CLEF_STAFF: Record<NotationClef, ClefStaffGeometry> = {
  treble: {
    topStep: 5 * 7 + 3, // F5
    bottomStep: 4 * 7 + 2, // E4
    midStep: 4 * 7 + 6, // B4
  },
  alto: {
    topStep: 4 * 7 + 4, // G4
    bottomStep: 3 * 7 + 3, // F3
    midStep: 4 * 7 + 0, // C4
  },
  bass: {
    topStep: 3 * 7 + 5, // A3
    bottomStep: 2 * 7 + 4, // G2
    midStep: 3 * 7 + 1, // D3
  },
};

export type ClefGlyphSpec = {
  clef: NotationClef;
  /** SMuFL glyph (Bravura). */
  glyph: string;
  /** Staff steps from the top line where the glyph origin sits. */
  originStep: number;
  advanceSpaces: number;
  aboveSpaces: number;
  belowSpaces: number;
};

/** Treble G-clef origin on the G line; alto C-clef origin on the middle C line. */
export const CLEF_GLYPHS: Record<NotationClef, ClefGlyphSpec> = {
  treble: {
    clef: "treble",
    glyph: "\uE050",
    originStep: 6,
    advanceSpaces: 2.684,
    aboveSpaces: 1.45,
    belowSpaces: 1.75,
  },
  alto: {
    clef: "alto",
    glyph: "\uE05C",
    originStep: 4,
    advanceSpaces: 2.76,
    aboveSpaces: 2.05,
    belowSpaces: 2.05,
  },
  bass: {
    clef: "bass",
    glyph: "\uE062",
    originStep: 2,
    advanceSpaces: 2.84,
    aboveSpaces: 1.2,
    belowSpaces: 1.9,
  },
};

/** Open A and E5 — high enough that alto would need many ledger lines. */
const VIOLA_TREBLE_FLOOR = 69; // A4
const VIOLA_HIGH_PASSAGE_MIN = 62; // D4
const VIOLA_HIGH_PASSAGE_MAX = 76; // E5

/**
 * Clef for a written passage. A single-staff instrument keeps its clef
 * (viola may move into treble when the notes sit high). A grand-staff
 * instrument uses treble or bass for the register of these notes.
 */
export function clefForNotes(
  instrument: InstrumentProfile,
  midis: readonly number[] = [],
): NotationClef {
  if (instrument.staffSystem === "grand") return trebleOrBassForMidis(midis);
  if (instrument.clef !== "alto") return instrument.clef;
  return altoOrTrebleForMidis(midis);
}

function trebleOrBassForMidis(midis: readonly number[]): NotationClef {
  if (midis.length === 0) return "treble";
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  if (max < 60) return "bass";
  if (min >= 60) return "treble";
  let treble = 0;
  let bass = 0;
  for (const midi of midis) {
    if (midi >= 64 && midi <= 77) treble += 1;
    if (midi >= 43 && midi <= 57) bass += 1;
  }
  return bass > treble ? "bass" : "treble";
}

function altoOrTrebleForMidis(midis: readonly number[]): NotationClef {
  if (midis.length === 0) return "alto";
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  if (min >= VIOLA_TREBLE_FLOOR) return "treble";
  if (min >= VIOLA_HIGH_PASSAGE_MIN && max >= VIOLA_HIGH_PASSAGE_MAX) {
    return "treble";
  }
  return "alto";
}

export function clefGlyph(clef: NotationClef): ClefGlyphSpec {
  return CLEF_GLYPHS[clef];
}
