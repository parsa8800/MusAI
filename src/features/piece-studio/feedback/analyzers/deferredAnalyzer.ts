import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import { notReadySkill } from "@/features/piece-studio/feedback/pieceFeedbackTypes";

/** Factory for skills that are declared but not implemented yet. */
export function createDeferredAnalyzer(
  category: PieceFeedbackAnalyzer["category"],
): PieceFeedbackAnalyzer {
  return {
    category,
    analyze: () => notReadySkill(category),
  };
}
