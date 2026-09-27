import {
  centsFromTarget,
  formatNoteLabel,
  matchHzToPitchClass,
  midiToHz,
  pitchClassLabel,
} from "@/lib/intonation";
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

function rankOpenStrings(heardHz: number, instrument: InstrumentProfile) {
  return tunerStringsFor(instrument)
    .map((s) => {
      const match = matchHzToPitchClass(heardHz, s.pitchClass);
      return { string: s, match, abs: Math.abs(match.cents) };
    })
    .sort((a, b) => a.abs - b.abs || a.string.refMidi - b.string.refMidi);
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

function chromaticReading(
  heardHz: number,
  instrument: InstrumentProfile,
): TunerReading | null {
  const raw = Math.round(69 + 12 * Math.log2(heardHz / 440));
  if (!Number.isFinite(raw)) return null;
  const targetMidi = Math.min(instrument.midiMax, Math.max(instrument.midiMin, raw));
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
    score: abs <= TUNER_IN_TUNE_CENTS ? 1 : Math.max(0, 1 - abs / 100),
    tone,
    direction,
  };
}

export function identifyTunerPitch(
  heardHz: number,
  previousStringId: TunerStringId | null = null,
  instrument: InstrumentProfile = getActiveInstrument(),
): TunerReading | null {
  if (!Number.isFinite(heardHz) || heardHz <= 0) return null;
  if (instrument.openStrings.length === 0) {
    return chromaticReading(heardHz, instrument);
  }

  const ranked = rankOpenStrings(heardHz, instrument);
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

export function tunerCueCopy(
  reading: TunerReading | null,
  instrument: InstrumentProfile = getActiveInstrument(),
): {
  headline: string;
  hint: string;
} {
  const waiting =
    instrument.openStrings.length === 0 ? "Play a note" : "Play a string";
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
