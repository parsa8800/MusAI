import { CLEF_GLYPHS, CLEF_STAFF } from "@/lib/instrument/notation";
import type { NotationClef } from "@/lib/instrument/types";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

const FIFTHS_MAJOR = [
  "C♭ major",
  "G♭ major",
  "D♭ major",
  "A♭ major",
  "E♭ major",
  "B♭ major",
  "F major",
  "C major",
  "G major",
  "D major",
  "A major",
  "E major",
  "B major",
  "F♯ major",
  "C♯ major",
] as const;

const FIFTHS_MINOR = [
  "A♭ minor",
  "E♭ minor",
  "B♭ minor",
  "F minor",
  "C minor",
  "G minor",
  "D minor",
  "A minor",
  "E minor",
  "B minor",
  "F♯ minor",
  "C♯ minor",
  "G♯ minor",
  "D♯ minor",
  "A♯ minor",
] as const;

/** F C G D A E B — diatonic steps from C0. */
const SHARP_PITCHES = [38, 35, 39, 36, 33, 37, 34];
/** B E A D G C F. */
const FLAT_PITCHES = [34, 37, 33, 36, 32, 35, 31];

const SPACE = 8;

export type PieceIncipitAccidental = {
  x: number;
  /** Diatonic step from C0, so the clef can place it. */
  pitchStep: number;
  kind: "sharp" | "flat";
};

export type OpeningEvent = {
  kind: "note" | "rest";
  /** Staff steps from the top line. 0 is the top line, 8 the bottom. */
  step: number;
  durationQuarters: number;
};

export type PieceIncipitNote = OpeningEvent & {
  x: number;
  learned: boolean;
};

export type PieceIncipitLayout = {
  viewW: number;
  viewH: number;
  space: number;
  staffTop: number;
  staffYs: number[];
  clefX: number;
  clefFont: number;
  originY: number;
  accidentals: PieceIncipitAccidental[];
  time: { x: number; beats: number; beatType: number } | null;
  notes: PieceIncipitNote[];
  contentBarX: number;
  endBarX: number;
};

const LETTER_STEP: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

/** Staff steps down from this clef's top line. */
export function staffStepFromTop(
  step: string,
  octave: number,
  clef: NotationClef,
): number {
  const diatonic = octave * 7 + (LETTER_STEP[step] ?? 0);
  return CLEF_STAFF[clef].topStep - diatonic;
}

/**
 * The written opening — first measure, or the first two when the first is
 * short — so a library card shows that piece and not a stand-in phrase.
 */
export function openingEventsFromScore(
  score: MusaiScoreV1 | null | undefined,
  clef: NotationClef,
): OpeningEvent[] {
  const measures = score?.parts[0]?.measures ?? [];
  if (measures.length === 0) return [];
  const heads = (measure: (typeof measures)[number]) =>
    measure.events.filter(
      (event) => event.kind === "rest" || (event.kind === "note" && !event.chord),
    ).length;
  const measureLimit = heads(measures[0]!) > 12 ? 1 : 2;
  const out: OpeningEvent[] = [];
  for (const measure of measures.slice(0, measureLimit)) {
    for (const event of measure.events) {
      if (event.kind === "note") {
        if (event.chord) continue;
        out.push({
          kind: "note",
          step: staffStepFromTop(event.pitch.step, event.pitch.octave, clef),
          durationQuarters: event.durationQuarters,
        });
      } else if (event.kind === "rest") {
        out.push({
          kind: "rest",
          step: 4,
          durationQuarters: event.durationQuarters,
        });
      }
      if (out.length >= 14) return out;
    }
  }
  return out;
}

/** Circle-of-fifths count. Positive is sharps. Unknown labels stay unsigned. */
export function keySignatureFifths(label: string | null | undefined): number {
  if (!label) return 0;
  const trimmed = label.trim();
  const major = FIFTHS_MAJOR.indexOf(trimmed as (typeof FIFTHS_MAJOR)[number]);
  if (major >= 0) return major - 7;
  const minor = FIFTHS_MINOR.indexOf(trimmed as (typeof FIFTHS_MINOR)[number]);
  if (minor >= 0) return minor - 7;
  const ascii = trimmed
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .toLowerCase();
  const asciiMajor = FIFTHS_MAJOR.findIndex(
    (name) => name.replace("♯", "#").replace("♭", "b").toLowerCase() === ascii,
  );
  if (asciiMajor >= 0) return asciiMajor - 7;
  const asciiMinor = FIFTHS_MINOR.findIndex(
    (name) => name.replace("♯", "#").replace("♭", "b").toLowerCase() === ascii,
  );
  if (asciiMinor >= 0) return asciiMinor - 7;
  return 0;
}

export function parseTimeSignature(
  raw: string | null | undefined,
): [number, number] | null {
  const match = raw?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const beats = Number(match[1]);
  const beatType = Number(match[2]);
  if (beats < 1 || beats > 16 || beatType < 1 || beatType > 16) return null;
  return [beats, beatType];
}

export function learnedNoteCount(total: number, progress: number): number {
  if (total <= 0 || progress <= 0) return 0;
  if (progress >= 100) return total;
  return Math.max(1, Math.round((Math.min(100, progress) / 100) * total));
}

export function layoutPieceIncipit(input: {
  events: readonly OpeningEvent[];
  keySignature: string | null;
  timeSignature: string | null;
  progress: number;
  clef: NotationClef;
}): PieceIncipitLayout {
  const spec = CLEF_GLYPHS[input.clef];
  const fifths = keySignatureFifths(input.keySignature);
  const time = parseTimeSignature(input.timeSignature);
  const aboveSteps = input.events.reduce(
    (max, event) => Math.max(max, event.kind === "note" ? -event.step : 0),
    0,
  );
  const belowSteps = input.events.reduce(
    (max, event) => Math.max(max, event.kind === "note" ? event.step - 8 : 0),
    0,
  );
  const staffTop =
    Math.ceil(SPACE * spec.aboveSpaces) + 3 + aboveSteps * (SPACE / 2);
  const staffYs = [0, 1, 2, 3, 4].map((i) => staffTop + i * SPACE);
  const viewH =
    staffTop +
    4 * SPACE +
    Math.ceil(SPACE * spec.belowSpaces) +
    4 +
    belowSteps * (SPACE / 2);
  const viewW = 460;
  const clefX = SPACE * 0.7;
  const originY = staffTop + spec.originStep * (SPACE / 2);

  const sigCount = Math.min(7, Math.abs(fifths));
  const pitches = fifths >= 0 ? SHARP_PITCHES : FLAT_PITCHES;
  const kind = fifths >= 0 ? "sharp" : "flat";
  let x = clefX + spec.advanceSpaces * SPACE + SPACE * 0.35;
  const accidentals: PieceIncipitAccidental[] = [];
  for (let i = 0; i < sigCount; i += 1) {
    accidentals.push({ x, pitchStep: pitches[i] ?? pitches[0]!, kind });
    x += SPACE * 0.92;
  }
  if (sigCount > 0) x += SPACE * 0.25;

  const timeMark = time
    ? { x: x + SPACE * 0.15, beats: time[0], beatType: time[1] }
    : null;
  if (time) x += SPACE * 1.55;

  const contentBarX = x + SPACE * 0.15;
  const endBarX = viewW - SPACE * 0.55;
  const learned = learnedNoteCount(input.events.length, input.progress);
  const weights = input.events.map((event) =>
    Math.max(0.5, Math.min(event.durationQuarters, 4)),
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const span = Math.max(SPACE, endBarX - contentBarX - SPACE * 0.7);
  let cursor = contentBarX + SPACE * 0.45;
  const notes = input.events.map((event, index) => {
    const width = (span * (weights[index] ?? 1)) / weightTotal;
    const noteX = cursor + width / 2;
    cursor += width;
    return {
      ...event,
      x: noteX,
      learned: event.kind === "note" && index < learned,
    };
  });

  return {
    viewW,
    viewH,
    space: SPACE,
    staffTop,
    staffYs,
    clefX,
    clefFont: SPACE * 4,
    originY,
    accidentals,
    time: timeMark,
    notes,
    contentBarX,
    endBarX,
  };
}

/** Staff y for a diatonic pitch, given this clef's top line. */
export function accidentalStaffY(
  layout: PieceIncipitLayout,
  pitchStep: number,
  clef: NotationClef,
): number {
  const top = CLEF_STAFF[clef].topStep;
  return layout.staffTop + (top - pitchStep) * (layout.space / 2);
}
