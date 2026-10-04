import {
  centsFromTarget,
  formatNoteLabel,
  midiToHz,
  pitchClassLabel,
} from "@/lib/intonation";
import { scoreForAbsCents } from "@/lib/intonationScore";
import { getInstrument } from "@/lib/instrument/catalog";
import { tunerStringsFor } from "@/lib/instrument/helpers";
import { OPEN_STRINGS } from "@/lib/instrument/openStrings";
import { getActiveInstrument } from "@/lib/instrument/storage";
import type { InstrumentProfile, OpenStringId } from "@/lib/instrument/types";
import type { NoteVisualTone } from "@/lib/scaleNoteVisual";

/** Shared open-string pitches. Layout comes from the instrument profile. */
export const TUNER_STRINGS = {
  C: { id: "C" as const, pitchClass: OPEN_STRINGS.C.pitchClass, refMidi: OPEN_STRINGS.C.midi },
  G: { id: "G" as const, pitchClass: OPEN_STRINGS.G.pitchClass, refMidi: OPEN_STRINGS.G.midi },
  D: { id: "D" as const, pitchClass: OPEN_STRINGS.D.pitchClass, refMidi: OPEN_STRINGS.D.midi },
  A: { id: "A" as const, pitchClass: OPEN_STRINGS.A.pitchClass, refMidi: OPEN_STRINGS.A.midi },
  E: { id: "E" as const, pitchClass: OPEN_STRINGS.E.pitchClass, refMidi: OPEN_STRINGS.E.midi },
} as const;

export type TunerStringId = OpenStringId;
export type ViolinStringId = TunerStringId;
export type TunerOpenString = ReturnType<typeof tunerStringsFor>[number];

export const VIOLIN_STRINGS = tunerStringsFor(getInstrument("violin"));
export const VIOLA_STRINGS = tunerStringsFor(getInstrument("viola"));

export type TunerReading = {
  heardHz: number;
  heardLabel: string;
  targetMidi: number;
  targetHz: number;
  targetLabel: string;
  pitchClass: number;
  pitchClassName: string;
  stringId: TunerStringId | null;
  cents: number;
  score: number;
  tone: NoteVisualTone;
  direction: "low" | "high" | "in_tune" | "unclear";
};

/** A note must stay inside this window to count as in tune. */
export const TUNER_IN_TUNE_CENTS = 12;
/** Outside this, the pitch is clearly sharp or flat. */
const TUNER_NEAR_CENTS = 32;
/** Near the end of the needle, the miss is large. */
const TUNER_VERY_OFF_CENTS = 42;
/** About a second of steady in-tune time before a string locks green. */
export const IN_TUNE_HOLD_MS = 1000;
/** Ignore brief pitch dropouts so bow changes do not reset the hold. */
export const HOLD_DROPOUT_MS = 180;
/** Clear the live reading after this much silence. */
export const PITCH_SILENCE_MS = 280;
/** After every string is green, wait then unlock so the next player can start. */
export const ALL_TUNED_RESET_MS = 2800;

export type TunerHoldState = {
  stringId: TunerStringId;
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
  alreadyTuned: ReadonlySet<TunerStringId>,
): {
  hold: TunerHoldState | null;
  lock: TunerStringId | null;
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

export function pruneTunedToInstrument(
  tuned: ReadonlySet<TunerStringId>,
  instrument: InstrumentProfile,
): Set<TunerStringId> {
  const allowed = new Set(tunerStringsFor(instrument).map((s) => s.id));
  return new Set([...tuned].filter((id) => allowed.has(id)));
}

/** Letters in layout order; unknown slots stay empty regardless of play order. */
export function revealedSlots(
  instrument: InstrumentProfile,
  revealed: ReadonlySet<TunerStringId>,
): Array<TunerStringId | null> {
  return tunerStringsFor(instrument).map((s) =>
    revealed.has(s.id) ? s.id : null,
  );
}

/** Nearest chromatic note. Not clamped to an instrument range or open string. */
function chromaticReading(heardHz: number): TunerReading | null {
  const targetMidi = Math.round(69 + 12 * Math.log2(heardHz / 440));
  if (!Number.isFinite(targetMidi)) return null;
  const targetHz = midiToHz(targetMidi);
  const cents = Math.round(centsFromTarget(heardHz, targetHz) * 10) / 10;
  const abs = Math.abs(cents);
  const pitchClass = ((targetMidi % 12) + 12) % 12;
  const tone = tunerTone(abs);
  const direction: TunerReading["direction"] =
    abs <= TUNER_IN_TUNE_CENTS ? "in_tune" : cents > 0 ? "high" : "low";
  return {
    heardHz,
    heardLabel: formatNoteLabel(targetMidi),
    targetMidi,
    targetHz,
    targetLabel: formatNoteLabel(targetMidi),
    pitchClass,
    pitchClassName: pitchClassLabel(pitchClass),
    stringId: null,
    cents,
    score: scoreForAbsCents(abs),
    tone,
    direction,
  };
}

export function identifyTunerPitch(
  heardHz: number,
  _previousStringId: TunerStringId | null = null,
  _instrument: InstrumentProfile = getActiveInstrument(),
): TunerReading | null {
  if (!Number.isFinite(heardHz) || heardHz <= 0) return null;
  return chromaticReading(heardHz);
}

/** How far the note is, without a cent count. */
export function tunerCentsLabel(reading: TunerReading | null): string {
  if (!reading) return "";
  if (reading.direction === "in_tune") return "In tune";
  const abs = Math.abs(reading.cents);
  const way = reading.direction === "low" ? "flat" : "sharp";
  if (abs <= TUNER_NEAR_CENTS) return `A little ${way}`;
  if (abs < TUNER_VERY_OFF_CENTS) {
    return way === "flat" ? "Flat" : "Sharp";
  }
  return way === "flat" ? "Very flat" : "Very sharp";
}

export function tunerCueCopy(
  reading: TunerReading | null,
  _instrument: InstrumentProfile = getActiveInstrument(),
): {
  headline: string;
  hint: string;
} {
  const waiting = "Play a note";
  if (!reading) {
    return { headline: waiting, hint: "" };
  }
  if (reading.direction === "in_tune") {
    return { headline: "In tune", hint: "" };
  }
  if (reading.direction === "low") {
    return { headline: "Too low", hint: "" };
  }
  if (reading.direction === "high") {
    return { headline: "Too high", hint: "" };
  }
  return { headline: waiting, hint: "" };
}
