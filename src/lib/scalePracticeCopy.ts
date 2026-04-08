import type { ScalePracticeNoteRow, ScalePracticeTrend } from "@/lib/scalePracticeTypes";

/** Human-facing strings only — keep separate from numeric session payload for AI layer. */

export function trendSentence(trend: ScalePracticeTrend): string {
  switch (trend) {
    case "sharp":
      return "Overall you trend slightly sharp — think about relaxing into the pitch.";
    case "flat":
      return "Overall you trend slightly flat — aim a touch higher through the bow.";
    default:
      return "Your average bias is fairly centred across the scale.";
  }
}

export function noteRowHint(row: ScalePracticeNoteRow): string {
  if (row.missingData) {
    return "No clear pitch in this slice — try slower, separated notes.";
  }
  switch (row.intonationBucket) {
    case "in_tune":
      return "Solid centre on this step.";
    case "sharp":
      return "A bit high — lighten finger weight or slide slightly lower.";
    case "flat":
      return "A bit low — set the finger higher or add bow speed.";
    default:
      return "";
  }
}

export function weakestIntro(): string {
  return "Steps that needed the most attention";
}
