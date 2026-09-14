/**
 * Structured piece feedback. Coach Parsa should import from here —
 * not from audio capture or pitch-frame helpers.
 */
export type {
  PieceCoachContextV1,
  PieceCoachFocusItemV1,
} from "@/features/piece-studio/feedback/pieceCoachContext";
export {
  buildPieceCoachContext,
  coachFocusItemFromEvent,
} from "@/features/piece-studio/feedback/pieceCoachContext";
export { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";
export type {
  PieceFeedbackAnalyzer,
  PieceAnalyzerInput,
} from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
export {
  PitchAnalyzer,
  RhythmAnalyzer,
  TempoAnalyzer,
  DynamicsAnalyzer,
  ConsistencyAnalyzer,
  defaultPieceFeedbackAnalyzers,
} from "@/features/piece-studio/feedback/analyzers";
export { runPieceFeedback } from "@/features/piece-studio/feedback/pieceFeedbackOrchestrator";
export type {
  PieceFeedbackCategory,
  PieceFeedbackEventV1,
  PieceFeedbackKind,
  PieceFeedbackReportV1,
  PieceFeedbackSeverity,
  PieceFeedbackSkillMap,
  PieceSkillReportV1,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
export {
  PIECE_FEEDBACK_CATEGORIES,
  PIECE_FEEDBACK_SCHEMA_VERSION,
  emptySkillMap,
  severityFromImportance,
  skillMapFromReport,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
