import {
  centsFromTarget,
  formatNoteLabel,
  matchHzToPitchClass,
  midiToHz,
  pitchClassLabel,
} from "@/lib/intonation";
import { nearestMidiOfPitchClass, unwrapOctaveCents } from "@/lib/intonationScore";
import type { NoteVisualTone } from "@/lib/scaleNoteVisual";

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

/** A string must stay inside this window to count as in tune. */
export const TUNER_IN_TUNE_CENTS = 12;
/** Outside this, the pitch is clearly sharp or flat. */
const TUNER_NEAR_CENTS = 32;
/** Continuous in-tune time before a string locks green. */
export const IN_TUNE_HOLD_MS = 1800;
/** Ignore brief pitch dropouts so bow changes do not reset the hold. */
export const HOLD_DROPOUT_MS = 180;
/** Clear the live reading after this much silence. */
export const PITCH_SILENCE_MS = 280;

export type TunerHoldState = {
  stringId: ViolinStringId;
  startedAt: number;
  lastInTuneAt: number;
};

function tunerTone(absCents: number): NoteVisualTone {
  if (absCents <= TUNER_IN_TUNE_CENTS) return "good";
  if (absCents <= TUNER_NEAR_CENTS) return "slight";
  return "bad";
}

export function isLockableInTune(reading: TunerReading | null): boolean {
  return (
    reading != null &&
    reading.stringId != null &&
    reading.direction === "in_tune" &&
    reading.tone === "good"
  );
}

/**
 * Accumulate in-tune time for one open string. Sharp/flat resets immediately;
 * a short silent dropout does not.
 */
export function advanceTunerHold(
  prev: TunerHoldState | null,
  reading: TunerReading | null,
  now: number,
  alreadyTuned: ReadonlySet<ViolinStringId>,
): {
  hold: TunerHoldState | null;
  lock: ViolinStringId | null;
  progress: number;
} {
  const id = reading?.stringId ?? null;
  if (id && alreadyTuned.has(id)) {
    return { hold: null, lock: null, progress: 1 };
  }

  if (isLockableInTune(reading) && id) {
    if (!prev || prev.stringId !== id) {
      return {
        hold: { stringId: id, startedAt: now, lastInTuneAt: now },
        lock: null,
        progress: 0,
      };
    }
    const hold = { ...prev, lastInTuneAt: now };
    const elapsed = now - hold.startedAt;
    const progress = Math.min(1, elapsed / IN_TUNE_HOLD_MS);
    return {
      hold,
      lock: elapsed >= IN_TUNE_HOLD_MS ? id : null,
      progress,
    };
  }

  const dropoutOnly = reading == null;
  if (prev && dropoutOnly && now - prev.lastInTuneAt <= HOLD_DROPOUT_MS) {
    const progress = Math.min(
      1,
      (prev.lastInTuneAt - prev.startedAt) / IN_TUNE_HOLD_MS,
    );
    return { hold: prev, lock: null, progress };
  }

  return { hold: null, lock: null, progress: 0 };
}

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
  const tone = tunerTone(abs);
  const direction: TunerReading["direction"] =
    abs <= TUNER_IN_TUNE_CENTS
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
