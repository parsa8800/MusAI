import { formatNoteLabel } from "@/lib/intonation";

/** Open strings in first position reference (MIDI). */
const STRINGS = [
  { lane: 0, letter: "G", openMidi: 55 },
  { lane: 1, letter: "D", openMidi: 62 },
  { lane: 2, letter: "A", openMidi: 69 },
  { lane: 3, letter: "E", openMidi: 76 },
] as const;

const MAX_HALF_STEPS_FROM_OPEN = 5;

export type ViolinScaleStepRef = {
  midi: number;
  noteLabel: string;
  lane: number;
  stringLetter: string;
  /** 0 = open */
  halfStepsFromOpen: number;
  hint: string;
};

function fingerWord(n: number): string {
  if (n === 0) return "open";
  if (n === 1) return "1st finger";
  if (n === 2) return "2nd finger";
  if (n === 3) return "3rd finger";
  if (n === 4) return "4th finger";
  if (n === 5) return "4th finger (wide whole-step)";
  return `${n} half-steps up`;
}

/**
 * Map a MIDI pitch to a first-position style hint on one of the four strings.
 * When multiple strings fit, prefer the lower-pitched string (more natural for beginners).
 */
export function violinStepReference(midi: number): ViolinScaleStepRef {
  const candidates: {
    lane: number;
    stringLetter: string;
    halfStepsFromOpen: number;
  }[] = [];

  for (const s of STRINGS) {
    const d = midi - s.openMidi;
    if (d >= 0 && d <= MAX_HALF_STEPS_FROM_OPEN) {
      candidates.push({
        lane: s.lane,
        stringLetter: s.letter,
        halfStepsFromOpen: d,
      });
    }
  }

  if (candidates.length === 0) {
    const approxLane =
      midi < 62 ? 0 : midi < 69 ? 1 : midi < 76 ? 2 : 3;
    const s = STRINGS[approxLane]!;
    return {
      midi,
      noteLabel: formatNoteLabel(midi),
      lane: approxLane,
      stringLetter: s.letter,
      halfStepsFromOpen: Math.max(0, Math.min(4, midi - s.openMidi)),
      hint:
        midi < STRINGS[0]!.openMidi
          ? "This pitch is below the violin’s open G — use a lower starting note or ask a teacher for shifting."
          : "This pitch is high — you may need 2nd or 3rd position. Use a fingering your teacher recommends.",
    };
  }

  candidates.sort((a, b) => a.lane - b.lane);
  const pick = candidates[0]!;
  return {
    midi,
    noteLabel: formatNoteLabel(midi),
    lane: pick.lane,
    stringLetter: pick.stringLetter,
    halfStepsFromOpen: pick.halfStepsFromOpen,
    hint: `${pick.stringLetter} string, ${fingerWord(pick.halfStepsFromOpen)}`,
  };
}
