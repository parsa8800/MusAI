/** Listening speeds as fractions of the tempo written on the piece. */
export const PIECE_SPEED_PRESETS = [
  { id: "half", label: "½", ratio: 0.5, aria: "Half tempo" },
  { id: "threeQuarter", label: "¾", ratio: 0.75, aria: "Three-quarter tempo" },
  { id: "written", label: "1×", ratio: 1, aria: "Written tempo" },
] as const;

export type PieceSpeedPreset = (typeof PIECE_SPEED_PRESETS)[number]["id"];

export function pieceSpeedBpm(preset: PieceSpeedPreset, baseBpm: number): number {
  const speed = PIECE_SPEED_PRESETS.find((item) => item.id === preset);
  const ratio = speed?.ratio ?? 1;
  return Math.round(Math.max(1, baseBpm) * ratio);
}

/** Highlight a speed button when the slider sits on that fraction. */
export function pieceSpeedPresetForBpm(
  bpm: number,
  baseBpm: number,
): PieceSpeedPreset | null {
  const base = Math.max(1, baseBpm);
  for (const speed of PIECE_SPEED_PRESETS) {
    if (Math.abs(bpm - base * speed.ratio) <= 1) return speed.id;
  }
  return null;
}
