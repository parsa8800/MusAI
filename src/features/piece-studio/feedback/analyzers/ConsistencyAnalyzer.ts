import { createDeferredAnalyzer } from "@/features/piece-studio/feedback/analyzers/deferredAnalyzer";

/**
 * Consistency across takes is not implemented yet.
 * Returns `not_ready` with no events — do not invent weak-section findings.
 */
export const ConsistencyAnalyzer = createDeferredAnalyzer("consistency");
