import { createDeferredAnalyzer } from "@/features/piece-studio/feedback/analyzers/deferredAnalyzer";

/**
 * Tempo is not implemented yet.
 * Returns `not_ready` with no events — do not invent rushing/slowing findings.
 */
export const TempoAnalyzer = createDeferredAnalyzer("tempo");
