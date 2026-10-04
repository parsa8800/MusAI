/**
 * Recorded solo violin for Listen when the player instrument is violin.
 * VSCO 2 Community Edition, long bow with vibrato, forte layer. CC0.
 * Remove this file and `public/audio/violin/` to drop the trial sound.
 * Nearby pitches are pitch-shifted from the nearest recording.
 */
export const VIOLIN_SAMPLE_NOTES = [
  "G3",
  "A3",
  "C4",
  "E4",
  "G4",
  "A4",
  "C5",
  "E5",
  "G5",
  "A5",
  "C6",
  "E6",
  "G6",
  "A6",
  "C7",
] as const;

export function violinSampleBuffers(): Record<string, string> {
  const buffers: Record<string, string> = {};
  for (const note of VIOLIN_SAMPLE_NOTES) {
    buffers[note] = `/audio/violin/${note}.m4a`;
  }
  return buffers;
}
