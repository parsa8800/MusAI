/**
 * Structured piece feedback. Coach Parsa reads this — not audio buffers.
 *
 * Skills are independent. A category with status `not_ready` must not invent
 * events. Only pitch analysis is implemented today.
 */

export const PIECE_FEEDBACK_SCHEMA_VERSION = 1 as const;

export const PIECE_FEEDBACK_CATEGORIES = [
  "pitch",
  "rhythm",
  "tempo",
  "dynamics",
  "consistency",
] as const;

export type PieceFeedbackCategory = (typeof PIECE_FEEDBACK_CATEGORIES)[number];

export type PieceFeedbackKind =
  | "sharp"
  | "flat"
  | "missed"
  | "unstable"
  | "early"
  | "late"
  | "duration"
  | "rushing"
  | "slowing"
  | "too_loud"
  | "too_soft"
  | "weak_section";

/** How urgently Coach Parsa should surface the event. */
export type PieceFeedbackSeverity = "info" | "notice" | "focus";

export type PieceFeedbackSkillStatus = "ready" | "not_ready";

/**
 * One addressable finding from a single skill analyzer.
 * Location + time fields may be null when the skill cannot place the event.
 */
export type PieceFeedbackEventV1 = {
  schemaVersion: typeof PIECE_FEEDBACK_SCHEMA_VERSION;
  eventId: string;
  category: PieceFeedbackCategory;
  kind: PieceFeedbackKind;
  /** Written measure label from the score, e.g. "1". */
  measure: string | null;
  /** Beat within the measure when known. */
  beat: number | null;
  /** Index into the piece’s expected melody notes. */
  noteIndex: number | null;
  onsetQuarters: number | null;
  /** Wall time in the recording when the event was heard. */
  recordingTimeSec: number | null;
  severity: PieceFeedbackSeverity;
  confidence: number;
  /** 0–1 ranking weight for orchestration / Coach focus order. */
  importance: number;
  /** Short student-friendly explanation (no cents / DSP jargon). */
  explanation: string;
};

export type PieceSkillReportV1 = {
  category: PieceFeedbackCategory;
  status: PieceFeedbackSkillStatus;
  events: PieceFeedbackEventV1[];
};

export type PieceFeedbackReportV1 = {
  schemaVersion: typeof PIECE_FEEDBACK_SCHEMA_VERSION;
  pieceId: string;
  attemptId: string;
  skills: PieceSkillReportV1[];
  events: PieceFeedbackEventV1[];
};

export type PieceFeedbackSkillMap = Record<
  PieceFeedbackCategory,
  PieceFeedbackSkillStatus
>;

export function emptySkillMap(): PieceFeedbackSkillMap {
  return {
    pitch: "not_ready",
    rhythm: "not_ready",
    tempo: "not_ready",
    dynamics: "not_ready",
    consistency: "not_ready",
  };
}

export function skillMapFromReport(
  report: PieceFeedbackReportV1,
): PieceFeedbackSkillMap {
  const map = emptySkillMap();
  for (const skill of report.skills) {
    map[skill.category] = skill.status;
  }
  return map;
}

export function notReadySkill(category: PieceFeedbackCategory): PieceSkillReportV1 {
  return { category, status: "not_ready", events: [] };
}

export function severityFromImportance(
  importance: number,
): PieceFeedbackSeverity {
  if (importance >= 0.7) return "focus";
  if (importance >= 0.45) return "notice";
  return "info";
}

export function sortFeedbackEvents(
  events: readonly PieceFeedbackEventV1[],
): PieceFeedbackEventV1[] {
  return [...events].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.confidence - a.confidence;
  });
}
