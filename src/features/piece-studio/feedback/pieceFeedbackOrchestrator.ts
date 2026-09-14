import type {
  PieceAnalyzerInput,
  PieceFeedbackAnalyzer,
} from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import {
  PIECE_FEEDBACK_SCHEMA_VERSION,
  sortFeedbackEvents,
  type PieceFeedbackReportV1,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";

/**
 * Orchestration only: run independent skill analyzers and merge their reports.
 * Does not perform pitch / rhythm / tempo DSP itself.
 */
export function runPieceFeedback(
  input: PieceAnalyzerInput,
  analyzers: readonly PieceFeedbackAnalyzer[],
): PieceFeedbackReportV1 {
  const skills = analyzers.map((analyzer) => {
    const report = analyzer.analyze(input);
    if (report.status === "not_ready") {
      return { ...report, events: [] };
    }
    return {
      ...report,
      events: report.events.filter(
        (event) => event.category === analyzer.category,
      ),
    };
  });
  const events = sortFeedbackEvents(skills.flatMap((skill) => skill.events));
  return {
    schemaVersion: PIECE_FEEDBACK_SCHEMA_VERSION,
    pieceId: input.pieceId,
    attemptId: input.attemptId,
    skills,
    events,
  };
}
