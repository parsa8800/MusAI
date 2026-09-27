import { formatNoteLabel } from "@/lib/intonation";
import { getActiveInstrument } from "@/lib/instrument/storage";
import type { InstrumentProfile } from "@/lib/instrument/types";

const MAX_HALF_STEPS_FROM_OPEN = 5;
const FINGER_FROM_HALF_STEPS = [0, 1, 1, 2, 2, 3, 4, 4] as const;

export type ScaleStepRef = {
  midi: number;
  noteLabel: string;
  lane: number;
  stringLetter: string;
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
 * First-position hint for a MIDI pitch on this instrument's open strings.
 * When two strings fit, prefer the lower-pitched string.
 */
export function stepReference(
  midi: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): ScaleStepRef {
  const strings = instrument.openStrings;
  if (strings.length === 0) {
    return {
      midi,
      noteLabel: formatNoteLabel(midi),
      lane: 0,
      stringLetter: "",
      halfStepsFromOpen: 0,
      hint: "",
    };
  }
  const candidates: {
    lane: number;
    stringLetter: string;
    halfStepsFromOpen: number;
  }[] = [];

  for (const [lane, s] of strings.entries()) {
    const d = midi - s.midi;
    if (d >= 0 && d <= MAX_HALF_STEPS_FROM_OPEN) {
      candidates.push({
        lane,
        stringLetter: s.id,
        halfStepsFromOpen: d,
      });
    }
  }

  const lowest = strings[0]!;

  if (candidates.length === 0) {
    let approxLane = strings.length - 1;
    for (let i = 0; i < strings.length; i++) {
      const next = strings[i + 1];
      if (!next || midi < next.midi) {
        approxLane = i;
        break;
      }
    }
    const s = strings[approxLane]!;
    const instrumentName = instrument.name.toLowerCase();
    return {
      midi,
      noteLabel: formatNoteLabel(midi),
      lane: approxLane,
      stringLetter: s.id,
      halfStepsFromOpen: Math.max(0, Math.min(4, midi - s.midi)),
      hint:
        midi < lowest.midi
          ? `This pitch is below the ${instrumentName}’s open ${lowest.id} — use a lower starting note or ask a teacher for shifting.`
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

/**
 * Coach label like A2, D0, G3. Prefer next open string over 4th finger.
 */
export function stringFingerLabel(
  midi: number,
  instrument: InstrumentProfile = getActiveInstrument(),
): string {
  const strings = instrument.openStrings;
  if (strings.length === 0) return formatNoteLabel(midi);
  for (const s of strings) {
    if (midi === s.midi) return `${s.id}0`;
  }

  const ref = stepReference(midi, instrument);
  const hs = Math.max(0, Math.min(7, ref.halfStepsFromOpen));
  const finger = FINGER_FROM_HALF_STEPS[hs] ?? 3;

  if (finger === 4) {
    const nextOpen = strings.find((s) => s.midi === midi);
    if (nextOpen) return `${nextOpen.id}0`;
  }

  return `${ref.stringLetter}${finger}`;
}

export function fingerLabelRegex(
  instrument: InstrumentProfile = getActiveInstrument(),
): RegExp {
  const letters = instrument.openStrings.map((s) => s.id.toLowerCase()).join("");
  if (!letters) return /(?!)/;
  return new RegExp(`\\b([${letters}])([0-4])\\b`, "i");
}
