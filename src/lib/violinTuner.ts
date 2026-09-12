import {
  formatNoteLabel,
  matchHzToPitchClass,
  pitchClassLabel,
} from "@/lib/intonation";
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

/**
 * Stay on the current open string unless another is clearly closer.
 * Stops a slightly flat A from flipping to a G♯ letter.
 */
const STRING_HOLD_CENTS = 180;
const SWITCH_MARGIN_CENTS = 35;

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
/** After every string is green, wait then unlock so the next player can start. */
export const ALL_TUNED_RESET_MS = 2800;

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

function rankOpenStrings(heardHz: number) {
  return VIOLIN_STRINGS.map((s) => {
    const match = matchHzToPitchClass(heardHz, s.pitchClass);
    return { string: s, match, abs: Math.abs(match.cents) };
  }).sort(
    (a, b) => a.abs - b.abs || a.string.refMidi - b.string.refMidi,
  );
}

export function identifyTunerPitch(
  heardHz: number,
  previousStringId: ViolinStringId | null = null,
): TunerReading | null {
  if (!Number.isFinite(heardHz) || heardHz <= 0) return null;

  const ranked = rankOpenStrings(heardHz);
  const nearest = ranked[0];
  if (!nearest) return null;

  let chosen = nearest;
  if (previousStringId) {
    const prev = ranked.find((row) => row.string.id === previousStringId);
    if (
      prev &&
      prev.abs <= STRING_HOLD_CENTS &&
      !(nearest.abs + SWITCH_MARGIN_CENTS < prev.abs)
    ) {
      chosen = prev;
    }
  }

  const match = chosen.match;
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
    pitchClass: chosen.string.pitchClass,
    pitchClassName: pitchClassLabel(chosen.string.pitchClass),
    stringId: chosen.string.id,
    cents: Math.round(match.cents * 10) / 10,
    score: match.score,
    tone,
    direction,
  };
}

export function tunerCueCopy(reading: TunerReading | null): {
  headline: string;
  hint: string;
} {
  if (!reading) {
    return { headline: "Play a string", hint: "G, D, A, or E" };
  }
  if (reading.direction === "in_tune") {
    return { headline: "In tune", hint: "Hold it there" };
  }
  if (reading.direction === "low") {
    return { headline: "Too low", hint: "Go higher" };
  }
  if (reading.direction === "high") {
    return { headline: "Too high", hint: "Go lower" };
  }
  return { headline: "Play a string", hint: "G, D, A, or E" };
}
