/**
 * Scale Studio take-score knobs. Keep thresholds here — do not scatter
 * magic numbers through analysis or progress code.
 *
 * Pitch, tuning, and completeness must dominate. Timing and tone can
 * refine a score; they cannot rescue a take that missed or missed the
 * pitch of the scale.
 */
export const SCALE_SCORE_WEIGHTS = {
  noteAccuracy: 0.3,
  intonation: 0.25,
  completeness: 0.2,
  steadiness: 0.15,
  toneClarity: 0.1,
} as const;

/** |cents| at or below this still counts as the written pitch class. */
export const NOTE_ACCURACY_FULL_CENTS = 50;
/** Beyond this, a matched slot is treated as the wrong pitch. */
export const NOTE_ACCURACY_ZERO_CENTS = 85;

/** In-tune band used by note colouring and the intonation category. */
export const SCORE_IN_TUNE_CENTS = 25;
/** Soft miss band — still the right note, but not in tune. */
export const SCORE_CLEAR_MISS_CENTS = 45;

/**
 * When a take has no stored timing / tone samples (older sessions),
 * use a mid, slightly conservative stand-in so those categories cannot
 * invent excellence.
 */
export const UNKNOWN_STEADINESS_SCORE = 55;
export const UNKNOWN_TONE_SCORE = 55;

/** Need this many timed notes before steadiness is meaningful. */
export const STEADINESS_MIN_NOTES = 3;
/** Sparse takes get this × completeness instead of a fake rhythm score. */
export const STEADINESS_SPARSE_SCORE = 38;
/** duration/IOI CV of 0 → 100; CV of 1/this → 0. */
export const STEADINESS_CV_TO_ZERO = 0.62;

/** Pitch-frame clarity floor used by the detector (scale mode). */
export const TONE_CLARITY_FLOOR = 0.72;
/** Intra-note pitch wobble (cents stdev) that scores 0 for stability. */
export const TONE_STABILITY_CENTS_ZERO = 36;
export const TONE_CLARITY_BLEND = 0.62;
export const TONE_STABILITY_BLEND = 0.38;

/** Caps so a weighted average cannot look “almost done”. */
export const SCALE_SCORE_CAPS = {
  /** Played less than this fraction of the scale. */
  halfScaleFrac: 0.5,
  halfScaleCap: 46,
  /** Very short fragment (a few notes of a long exercise). */
  fragmentFrac: 0.34,
  fragmentCap: 28,
  /** Wrong or missed slots at or above this fraction. */
  wrongOrMissedFrac: 0.4,
  wrongOrMissedCap: 52,
  /** Correct-pitch fraction below this never looks nearly complete. */
  lowAccuracyFrac: 0.5,
  lowAccuracyCap: 50,
  mostlyWrongAccuracyFrac: 0.35,
  mostlyWrongCap: 40,
  /** Missing any expected note blocks a near-100 look. */
  incompleteCap: 91,
  /** Fraction of expected slots that are actually in tune. */
  lowInTuneFrac: 0.4,
  lowInTuneCap: 58,
  veryLowInTuneFrac: 0.25,
  veryLowInTuneCap: 48,
} as const;

/**
 * 100% is allowed only when every major category is genuinely strong.
 * A single weak pillar keeps the take below the ceiling.
 */
export const SCALE_EXCELLENT_MIN = {
  noteAccuracy: 94,
  intonation: 92,
  completeness: 98,
  steadiness: 78,
  toneClarity: 78,
} as const;

export const SCALE_EXCELLENT_IN_TUNE_PERCENT = 90;
export const SCALE_EXCELLENT_OVERALL = 88;

/** Below this, a take is treated as silence / a mic miss. */
export const SILENT_TAKE_ANALYZED = 0;

/**
 * Displayed progress ignores take-to-take jitter smaller than this
 * (one note flipping 24¢↔26¢, a slightly different run length).
 * Real quality changes sit well outside the band and still snap.
 */
export const PROGRESS_DEADBAND = 2.5;

/** How far past a cap threshold before the cap fully lifts. */
export const SCORE_CAP_BLEND = 0.06;
