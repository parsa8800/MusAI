import { TUNER_IN_TUNE_CENTS } from "@/lib/violinTuner";

/** Half-width of the pitch meter. Flat peg is −span, sharp peg is +span. */
export const TUNER_METER_SPAN_CENTS = 50;

/**
 * Fastest the marker may travel: the whole meter takes this long.
 * Kept slow so a peg turn can be watched instead of chased.
 * Small cents errors move much more slowly than this cap.
 */
export const TUNER_METER_GLIDE_MS = 2600;

/** How quickly a steady pitch outside the seat is followed. */
export const TUNER_METER_FOLLOW_MS = 420;

/**
 * Inside the in-tune window the marker eases into the center socket
 * instead of twitching with bow noise.
 */
export const TUNER_METER_SEAT_FOLLOW_MS = 720;

/**
 * A new side (low / in tune / high) must hold this long before the needle
 * aims there. Brief flicker and bow noise stay on the side already shown.
 */
export const TUNER_METER_SETTLE_MS = 200;

/**
 * The marker is seated in the center socket inside this many cents.
 * The wider in-tune window stays TUNER_IN_TUNE_CENTS.
 */
export const TUNER_METER_FIT_CENTS = 3.5;

/** A stalled frame cannot skip ahead by more than this. */
export const TUNER_METER_MAX_FRAME_MS = 40;

export type TunerMeterSide = "low" | "in_tune" | "high";

export type TunerMeterMotion = {
  shown: number;
  aim: number;
  pendingSide: TunerMeterSide | null;
  pendingSince: number | null;
};

export const IDLE_TUNER_METER: TunerMeterMotion = {
  shown: 0,
  aim: 0,
  pendingSide: null,
  pendingSince: null,
};

export function clampTunerMeterCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.max(-TUNER_METER_SPAN_CENTS, Math.min(TUNER_METER_SPAN_CENTS, cents));
}

/** Same window as string lock: inside ±TUNER_IN_TUNE_CENTS reads as in tune. */
export function tunerMeterSide(cents: number): TunerMeterSide {
  const c = clampTunerMeterCents(cents);
  if (Math.abs(c) <= TUNER_IN_TUNE_CENTS) return "in_tune";
  return c < 0 ? "low" : "high";
}

/** Needle and fill geometry for a cents value. 0% is flat, 100% is sharp. */
export function tunerMeterPercents(cents: number): {
  left: number;
  fillLeft: number;
  fillWidth: number;
} {
  const c = clampTunerMeterCents(cents);
  const t = (c + TUNER_METER_SPAN_CENTS) / (TUNER_METER_SPAN_CENTS * 2);
  return {
    left: t * 100,
    fillLeft: Math.min(t, 0.5) * 100,
    fillWidth: Math.abs(t - 0.5) * 100,
  };
}

/** Largest cents step one frame is allowed to take. */
export function tunerMeterMaxStep(dtMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  const capped = Math.min(dtMs, TUNER_METER_MAX_FRAME_MS);
  return ((TUNER_METER_SPAN_CENTS * 2) / TUNER_METER_GLIDE_MS) * capped;
}

function followTau(shown: number, aim: number): number {
  if (
    Math.abs(shown) <= TUNER_IN_TUNE_CENTS &&
    Math.abs(aim) <= TUNER_IN_TUNE_CENTS
  ) {
    return TUNER_METER_SEAT_FOLLOW_MS;
  }
  return TUNER_METER_FOLLOW_MS;
}

/**
 * Move toward `aim` without jumping. A large gap is speed-capped.
 * A small gap eases in, and eases more slowly once both ends are
 * inside the in-tune window. The last step lands on the aim.
 */
export function glideTunerMeterCents(
  shown: number,
  aim: number,
  dtMs: number,
  instant = false,
): number {
  const from = clampTunerMeterCents(shown);
  const to = clampTunerMeterCents(aim);
  if (instant) return to;
  if (!Number.isFinite(dtMs) || dtMs <= 0) return from;
  const delta = to - from;
  if (delta === 0) return to;
  const capped = Math.min(dtMs, TUNER_METER_MAX_FRAME_MS);
  const alpha = 1 - Math.exp(-capped / followTau(from, to));
  let step = delta * alpha;
  const maxStep = tunerMeterMaxStep(dtMs);
  if (Math.abs(step) > maxStep) step = Math.sign(delta) * maxStep;
  if (Math.abs(delta) <= Math.abs(step)) return to;
  return from + step;
}

/**
 * One animation frame. `sample` is the latest detected cents, or null
 * when the pitch has already been silent long enough to clear.
 * Silence aims at center immediately — the caller already waited out
 * dropouts. A side change waits out TUNER_METER_SETTLE_MS first.
 */
export function stepTunerMeter(
  prev: TunerMeterMotion,
  sample: number | null,
  now: number,
  dtMs: number,
  instant = false,
): TunerMeterMotion {
  if (sample == null || !Number.isFinite(sample)) {
    return {
      shown: glideTunerMeterCents(prev.shown, 0, dtMs, instant),
      aim: 0,
      pendingSide: null,
      pendingSince: null,
    };
  }

  const cents = clampTunerMeterCents(sample);
  const nextSide = tunerMeterSide(cents);
  const aimSide = tunerMeterSide(prev.aim);

  if (nextSide === aimSide) {
    return {
      shown: glideTunerMeterCents(prev.shown, cents, dtMs, instant),
      aim: cents,
      pendingSide: null,
      pendingSince: null,
    };
  }

  const samePending = prev.pendingSide === nextSide && prev.pendingSince != null;
  const since = samePending ? prev.pendingSince : now;
  if (now - since >= TUNER_METER_SETTLE_MS) {
    return {
      shown: glideTunerMeterCents(prev.shown, cents, dtMs, instant),
      aim: cents,
      pendingSide: null,
      pendingSince: null,
    };
  }

  return {
    shown: glideTunerMeterCents(prev.shown, prev.aim, dtMs, instant),
    aim: prev.aim,
    pendingSide: nextSide,
    pendingSince: since,
  };
}
