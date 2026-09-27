/**
 * Fingering sits on one row above the staff while notes stay inside it.
 * A note whose head reaches that row is lifted on its own.
 * Y grows downward, matching SVG.
 */
export type FingerLabelPlacement = {
  baseline: number;
  /** Stem-up tips must stay at or below this y so they do not enter the label. */
  stemTipFloor: number | null;
};

const HEAD_HALF_SPACES = 0.5;
const STEM_CLEAR_SPACES = 0.22;

export function fingerLabelGap(lineSpacing: number): number {
  return Math.max(10, lineSpacing);
}

export function placeFingerLabel(input: {
  staffTop: number;
  lineSpacing: number;
  /** Stem attachment on the notehead. Null when the note has no stem. */
  noteCenterY: number | null;
  stemTipY: number | null;
  stemUp: boolean;
}): FingerLabelPlacement {
  const spacing = input.lineSpacing > 0 ? input.lineSpacing : 18;
  const gap = fingerLabelGap(spacing);
  const common = input.staffTop - gap;
  let baseline = common;

  if (input.noteCenterY != null) {
    const noteTop = input.noteCenterY - spacing * HEAD_HALF_SPACES;
    if (noteTop < common + 1) {
      baseline = noteTop - gap;
    }
  }

  let stemTipFloor: number | null = null;
  if (input.stemUp && input.stemTipY != null) {
    const floor = baseline + spacing * STEM_CLEAR_SPACES;
    if (input.stemTipY < floor - 0.5) stemTipFloor = floor;
  }

  return { baseline, stemTipFloor };
}
