import { createDeferredAnalyzer } from "@/features/piece-studio/feedback/analyzers/deferredAnalyzer";

/**
 * Dynamics are not implemented yet.
 * Returns `not_ready` with no events — do not invent loud/soft findings.
 */
export const DynamicsAnalyzer = createDeferredAnalyzer("dynamics");
