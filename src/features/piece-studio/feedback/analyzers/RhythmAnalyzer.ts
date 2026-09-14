import { createDeferredAnalyzer } from "@/features/piece-studio/feedback/analyzers/deferredAnalyzer";

/**
 * Rhythm is not implemented yet.
 * Returns `not_ready` with no events — do not invent early/late findings.
 */
export const RhythmAnalyzer = createDeferredAnalyzer("rhythm");
