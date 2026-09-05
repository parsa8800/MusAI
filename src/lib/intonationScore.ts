/** Cents within this band count as in tune / green.
 *  Violin intonation is rarely tighter than ~20–25¢ in casual takes.
 */
export const SCALE_IN_TUNE_CENTS = 25;

/** Only mark a note as a clear miss (and show direction cues) past this. */
export const SCALE_CLEAR_MISS_CENTS = 45;

/**
 * Remove whole-octave error (±1200¢, ±2400¢, …) while keeping fine intonation.
 */
export function unwrapOctaveCents(cents: number): number {
  return cents - 1200 * Math.round(cents / 1200);
}

/**
 * Generous scoring: close pitches stay high.
 * ≤25¢ ≈ 100–92, ≤45¢ ≈ 92–78, then falls off more quickly.
 */
export function scoreForAbsCents(absCents: number): number {
  const a = Math.abs(absCents);
  if (a <= SCALE_IN_TUNE_CENTS) {
    return Math.round(100 - (a / SCALE_IN_TUNE_CENTS) * 8);
  }
  if (a <= SCALE_CLEAR_MISS_CENTS) {
    const t =
      (a - SCALE_IN_TUNE_CENTS) /
      (SCALE_CLEAR_MISS_CENTS - SCALE_IN_TUNE_CENTS);
    return Math.round(92 - t * 14);
  }
  return Math.max(
    0,
    Math.min(78, Math.round(78 - (a - SCALE_CLEAR_MISS_CENTS) * 1.1)),
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
