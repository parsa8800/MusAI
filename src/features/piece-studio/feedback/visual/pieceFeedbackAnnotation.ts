import type { PieceFeedbackCategory } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { MockPieceVisualStyle } from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";

/**
 * How a category paints on the score. Analyzers stay unaware of overlays —
 * the shared panel + adapter consume this.
 */
export function pieceFeedbackVisualStyle(
  category: PieceFeedbackCategory,
): MockPieceVisualStyle {
  switch (category) {
    case "pitch":
    case "rhythm":
      return "note";
    case "tempo":
    case "dynamics":
    case "consistency":
    default:
      return "measure";
  }
}

export function pieceFeedbackSpanWholeNotes(input: {
  category: PieceFeedbackCategory;
  onsetQuarters: number | null;
  durationQuarters: number | null;
}): { startWholeNotes: number; endWholeNotes: number } {
  const startQ = Math.max(0, input.onsetQuarters ?? 0);
  const style = pieceFeedbackVisualStyle(input.category);
  const durQ =
    input.durationQuarters && input.durationQuarters > 0
      ? input.durationQuarters
      : style === "note"
        ? 1
        : 4;
  return {
    startWholeNotes: startQ / 4,
    endWholeNotes: (startQ + Math.max(0.5, durQ)) / 4,
  };
}
