/** Cents within this band count as in tune for Scale Studio.
 *  Piece Studio noteheads use {@link PIECE_IN_TUNE_CENTS}.
 *  Casual takes rarely sit tighter than ~25–30¢; stay fair without chasing perfection.
 */
export const PRACTICE_IN_TUNE_CENTS = 30;

/** Only mark a note as a clear miss (and show direction cues) past this. */
export const PRACTICE_CLEAR_MISS_CENTS = 50;

/**
 * Piece Studio noteheads stay quiet a little past the shared practice line.
 * Scale Studio keeps {@link PRACTICE_IN_TUNE_CENTS}.
 */
export const PIECE_IN_TUNE_CENTS = 35;

/**
 * About a whole step. Piece Studio does not call this sharp or flat.
 * A semitone flat can still be the written note.
 */
export const PIECE_FAR_CENTS = 170;

/**
 * A tone away is a different written note, not a sharp or flat.
 * Piece Studio greys those. Anything closer still gets pitch colour.
 */
export const PRACTICE_WRONG_NOTE_CENTS = 200;

/** Scale Studio name for {@link PRACTICE_IN_TUNE_CENTS}. Prefer PRACTICE_* in new code. */
export const SCALE_IN_TUNE_CENTS = PRACTICE_IN_TUNE_CENTS;

/** Scale Studio name for {@link PRACTICE_CLEAR_MISS_CENTS}. Prefer PRACTICE_* in new code. */
export const SCALE_CLEAR_MISS_CENTS = PRACTICE_CLEAR_MISS_CENTS;

/**
 * Remove whole-octave error (±1200¢, ±2400¢, …) while keeping fine intonation.
 */
export function unwrapOctaveCents(cents: number): number {
  return cents - 1200 * Math.round(cents / 1200);
}

/**
 * Generous scoring: close pitches stay high.
 * Within the in-tune band ≈ 100–92, then the clear-miss band ≈ 92–78,
 * then falls off more quickly.
 */
export function scoreForAbsCents(absCents: number): number {
  const a = Math.abs(absCents);
  if (a <= PRACTICE_IN_TUNE_CENTS) {
    return Math.round(100 - (a / PRACTICE_IN_TUNE_CENTS) * 8);
  }
  if (a <= PRACTICE_CLEAR_MISS_CENTS) {
    const t =
      (a - PRACTICE_IN_TUNE_CENTS) /
      (PRACTICE_CLEAR_MISS_CENTS - PRACTICE_IN_TUNE_CENTS);
    return Math.round(92 - t * 14);
  }
  return Math.max(
    0,
    Math.min(78, Math.round(78 - (a - PRACTICE_CLEAR_MISS_CENTS) * 1.1)),
  );
}

/** MIDI of `pitchClass` whose frequency is closest to `detectedHz` (A4 = 440). */
export function nearestMidiOfPitchClass(
  detectedHz: number,
  pitchClass: number,
): number {
  const pc = ((pitchClass % 12) + 12) % 12;
  const detectedMidi = 69 + 12 * Math.log2(detectedHz / 440);
  const k = Math.round((detectedMidi - pc) / 12);
  return pc + 12 * k;
}
