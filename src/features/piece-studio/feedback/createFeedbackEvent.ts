import {
  PIECE_FEEDBACK_SCHEMA_VERSION,
  severityFromImportance,
  type PieceFeedbackEventV1,
  type PieceFeedbackSeverity,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";

type FeedbackEventFields = Omit<
  PieceFeedbackEventV1,
  "schemaVersion" | "severity"
> & {
  severity?: PieceFeedbackSeverity;
};

/**
 * Build a feedback event with the shared location / severity contract.
 * Analyzers should use this so Coach Parsa always receives a complete shape.
 */
export function createFeedbackEvent(
  fields: FeedbackEventFields,
): PieceFeedbackEventV1 {
  const importance = Math.max(0, Math.min(1, fields.importance));
  const confidence = Math.max(0, Math.min(1, fields.confidence));
  return {
    ...fields,
    schemaVersion: PIECE_FEEDBACK_SCHEMA_VERSION,
    importance,
    confidence,
    severity: fields.severity ?? severityFromImportance(importance),
  };
}
