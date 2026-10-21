/**
 * Once the reel is near the pitch, it catches up on this time scale
 * so the centered letter matches the note being played.
 */
export const TUNER_REEL_FOLLOW_MS = 150;

/**
 * Fastest a long move may travel. A string change stays readable,
 * then eases onto the note instead of snapping.
 */
export const TUNER_REEL_CRUISE_MS = 190;

/** A stalled frame cannot skip ahead by more than this. */
export const TUNER_REEL_MAX_FRAME_MS = 40;

/** A new flat/sharp phrase must hold this long before it is shown. */
export const TUNER_PHRASE_HOLD_MS = 420;

/** Common concert-pitch names. Flats cover brass and wind notes such as B♭ and E♭. */
export const TUNER_REEL_NOTES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

const REEL_SPAN = TUNER_REEL_NOTES.length;

export type TunerPhraseSide = "low" | "in_tune" | "high";

export type TunerPhraseSample = {
  name: string;
  phrase: string;
  side: TunerPhraseSide;
};

export type TunerSettledCopy = {
  name: string;
  phrase: string;
  side: TunerPhraseSide | "idle";
};

export type TunerCopyHold = {
  shown: TunerSettledCopy;
  pending: TunerPhraseSample | null;
  pendingSince: number | null;
};

export type TunerReelSample = {
  pitchClass: number;
  cents: number;
};

export type TunerReelMotion = {
  shown: number;
  resting: boolean;
};

export const IDLE_TUNER_COPY: TunerSettledCopy = {
  name: "",
  phrase: "",
  side: "idle",
};

export const IDLE_TUNER_COPY_HOLD: TunerCopyHold = {
  shown: IDLE_TUNER_COPY,
  pending: null,
  pendingSince: null,
};

export const IDLE_TUNER_REEL: TunerReelMotion = {
  shown: 9,
  resting: true,
};

export function tunerReelNote(index: number): (typeof TUNER_REEL_NOTES)[number] {
  const pc = ((index % REEL_SPAN) + REEL_SPAN) % REEL_SPAN;
  return TUNER_REEL_NOTES[pc]!;
}

/** Continuous reel position. 9 is in-tune A. Half a step toward B♭ is 9.5. */
export function tunerReelTarget(pitchClass: number, cents: number): number {
  const pc = ((pitchClass % REEL_SPAN) + REEL_SPAN) % REEL_SPAN;
  const shift = Number.isFinite(cents) ? cents / 100 : 0;
  return pc + shift;
}

/** The copy of `target` closest to the position already on screen. */
export function nearestReelAim(from: number, target: number): number {
  if (!Number.isFinite(from)) return target;
  const k = Math.round((from - target) / REEL_SPAN);
  return target + REEL_SPAN * k;
}

export function glideReelIndex(
  shown: number,
  aim: number,
  dtMs: number,
  instant = false,
): number {
  if (instant || !Number.isFinite(shown)) return aim;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return shown;
  const delta = aim - shown;
  if (Math.abs(delta) < 0.0005) return aim;
  const capped = Math.min(dtMs, TUNER_REEL_MAX_FRAME_MS);
  const distance = Math.abs(delta);
  const alpha = 1 - Math.exp(-capped / TUNER_REEL_FOLLOW_MS);
  let step = delta * alpha;
  if (distance > 0.75) {
    const cruise = capped / TUNER_REEL_CRUISE_MS;
    if (Math.abs(step) > cruise) step = Math.sign(delta) * cruise;
  }
  if (Math.abs(delta) <= Math.abs(step)) return aim;
  return shown + step;
}

export function stepTunerReel(
  prev: TunerReelMotion,
  sample: TunerReelSample | null,
  dtMs: number,
  instant = false,
): TunerReelMotion {
  if (sample == null) {
    return { shown: prev.shown, resting: prev.resting };
  }
  const target = tunerReelTarget(sample.pitchClass, sample.cents);
  if (prev.resting || instant) {
    return { shown: target, resting: false };
  }
  return {
    shown: glideReelIndex(prev.shown, nearestReelAim(prev.shown, target), dtMs, false),
    resting: false,
  };
}

function samePhrase(a: TunerPhraseSample, b: TunerPhraseSample): boolean {
  return a.name === b.name && a.phrase === b.phrase && a.side === b.side;
}

/**
 * The first phrase appears at once.
 * A later phrase waits until it has held still.
 * Silence keeps the last phrase, so the player can keep tuning from there.
 */
export function stepTunerCopy(
  prev: TunerCopyHold,
  sample: TunerPhraseSample | null,
  now: number,
): TunerCopyHold {
  if (sample == null) {
    if (prev.pending == null) return prev;
    return { shown: prev.shown, pending: null, pendingSince: null };
  }
  if (
    sample.name === prev.shown.name &&
    sample.phrase === prev.shown.phrase &&
    sample.side === prev.shown.side
  ) {
    if (prev.pending == null) return prev;
    return { shown: prev.shown, pending: null, pendingSince: null };
  }
  if (prev.shown.phrase === "") {
    return {
      shown: sample,
      pending: null,
      pendingSince: null,
    };
  }
  const since =
    prev.pending && samePhrase(prev.pending, sample) && prev.pendingSince != null
      ? prev.pendingSince
      : now;
  if (now - since >= TUNER_PHRASE_HOLD_MS) {
    return { shown: sample, pending: null, pendingSince: null };
  }
  return { shown: prev.shown, pending: sample, pendingSince: since };
}
