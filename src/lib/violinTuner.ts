import {
  centsFromTarget,
  formatNoteLabel,
  matchHzToPitchClass,
  midiToHz,
  pitchClassLabel,
} from "@/lib/intonation";
import { nearestMidiOfPitchClass, unwrapOctaveCents } from "@/lib/intonationScore";
import { toneFromAbsCents, type NoteVisualTone } from "@/lib/scaleNoteVisual";

/** Open-string references at A=440: G3, D4, A4, E5. */
export const VIOLIN_STRINGS = [
  { id: "G", pitchClass: 7, refMidi: 55 },
  { id: "D", pitchClass: 2, refMidi: 62 },
  { id: "A", pitchClass: 9, refMidi: 69 },
  { id: "E", pitchClass: 4, refMidi: 76 },
] as const;

export type ViolinStringId = (typeof VIOLIN_STRINGS)[number]["id"];

export type TunerReading = {
  heardHz: number;
  heardLabel: string;
  targetMidi: number;
  targetHz: number;
  targetLabel: string;
  pitchClass: number;
  pitchClassName: string;
  stringId: ViolinStringId | null;
  cents: number;
  score: number;
  tone: NoteVisualTone;
  direction: "low" | "high" | "in_tune" | "unclear";
};

const STRING_SNAP_CENTS = 50;

export function identifyTunerPitch(heardHz: number): TunerReading | null {
  if (!Number.isFinite(heardHz) || heardHz <= 0) return null;

  let bestString: (typeof VIOLIN_STRINGS)[number] | null = null;
  let bestAbs = Infinity;
  for (const s of VIOLIN_STRINGS) {
    const targetMidi = nearestMidiOfPitchClass(heardHz, s.pitchClass);
    const cents = Math.abs(
      unwrapOctaveCents(centsFromTarget(heardHz, midiToHz(targetMidi))),
    );
    if (cents < bestAbs) {
      bestAbs = cents;
      bestString = s;
    }
  }

  const useString = bestString != null && bestAbs <= STRING_SNAP_CENTS;
  const snapped = useString ? bestString : null;
  const pitchClass = snapped
    ? snapped.pitchClass
    : ((Math.round(69 + 12 * Math.log2(heardHz / 440)) % 12) + 12) % 12;

  const match = matchHzToPitchClass(heardHz, pitchClass);
  const abs = Math.abs(match.cents);
  const tone = toneFromAbsCents(abs);
  const direction: TunerReading["direction"] =
    tone === "good"
      ? "in_tune"
      : match.cents > 0
        ? "high"
        : "low";

  return {
    heardHz,
    heardLabel: formatNoteLabel(Math.round(69 + 12 * Math.log2(heardHz / 440))),
    targetMidi: match.targetMidi,
    targetHz: match.targetHz,
    targetLabel: formatNoteLabel(match.targetMidi),
    pitchClass,
    pitchClassName: pitchClassLabel(pitchClass),
    stringId: snapped ? snapped.id : null,
    cents: Math.round(match.cents * 10) / 10,
    score: match.score,
    tone,
    direction,
  };
}
