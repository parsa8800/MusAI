import {
  PIECE_FEEDBACK_CATEGORIES,
  severityFromImportance,
  type PieceFeedbackCategory,
  type PieceFeedbackEventV1,
  type PieceFeedbackKind,
  type PieceFeedbackReportV1,
  type PieceFeedbackSeverity,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";

export const PIECE_COACH_CONTEXT_SCHEMA_VERSION = 1 as const;

/**
 * One focus item Coach Parsa can render.
 * Built only from structured feedback events — never from audio buffers.
 */
export type PieceCoachFocusItemV1 = {
  eventId: string;
  category: PieceFeedbackCategory;
  kind: PieceFeedbackKind;
  severity: PieceFeedbackSeverity;
  confidence: number;
  measure: string | null;
  beat: number | null;
  noteIndex: number | null;
  onsetQuarters: number | null;
  recordingTimeSec: number | null;
  explanation: string;
  improveFirst: string;
  where: string;
  what: string;
  practise: string;
  coach: string;
};

/**
 * What Coach Parsa should read. Built only from a feedback report —
 * never from pitch frames or the recorder.
 */
export type PieceCoachContextV1 = {
  schemaVersion: typeof PIECE_COACH_CONTEXT_SCHEMA_VERSION;
  pieceId: string;
  attemptId: string;
  skillsReady: PieceFeedbackCategory[];
  skillsNotReady: PieceFeedbackCategory[];
  events: PieceFeedbackEventV1[];
  focus: PieceCoachFocusItemV1[];
};

function whereFromEvent(event: PieceFeedbackEventV1): string {
  if (event.measure && event.beat != null) {
    return `Bar ${event.measure}, beat ${event.beat}`;
  }
  if (event.measure) return `Bar ${event.measure}`;
  return "In this take";
}

function improveFirstFromKind(kind: PieceFeedbackKind): string {
  switch (kind) {
    case "sharp":
      return "Settle the high notes";
    case "flat":
      return "Lift the low notes";
    case "missed":
      return "Catch every written note";
    case "unstable":
      return "Hold the pitch steady";
    case "early":
      return "Wait for the beat";
    case "late":
      return "Arrive with the beat";
    case "duration":
      return "Give notes their full length";
    case "rushing":
      return "Keep the tempo steady";
    case "slowing":
      return "Keep the tempo moving";
    case "too_loud":
      return "Ease the loud spots";
    case "too_soft":
      return "Speak the soft spots";
    case "weak_section":
      return "Strengthen the shaky bars";
    default:
      return "Stay with this spot";
  }
}

function whatFromKind(
  kind: PieceFeedbackKind,
  explanation: string,
): string {
  switch (kind) {
    case "sharp":
      return "A few notes are running sharp";
    case "flat":
      return "A few notes are sitting flat";
    case "missed":
      return "Some written notes weren’t heard clearly";
    case "unstable":
      return "The pitch wavered on a held note";
    case "early":
      return "A note arrived ahead of the beat";
    case "late":
      return "A note arrived after the beat";
    case "duration":
      return "Some notes were cut short";
    case "rushing":
      return "This stretch ran ahead of the pulse";
    case "slowing":
      return "This stretch dragged behind the pulse";
    case "too_loud":
      return "A few spots were louder than written";
    case "too_soft":
      return "A few spots were quieter than written";
    case "weak_section":
      return "This section needs another slow pass";
    default: {
      const trimmed = explanation.trim();
      if (!trimmed) return "This spot needs another careful listen";
      // Prefer a short clause without trailing period noise.
      return trimmed.replace(/\.$/, "");
    }
  }
}

function practiseFromKind(kind: PieceFeedbackKind): string {
  switch (kind) {
    case "sharp":
    case "flat":
      return "Play the phrase slowly and relax into each note";
    case "missed":
      return "Air-bow the missing notes, then play the bar again";
    case "unstable":
      return "Hold the note quietly until it sits still";
    case "early":
    case "late":
    case "duration":
      return "Tap the beat, then play just this bar";
    case "rushing":
    case "slowing":
      return "Play under tempo, then bring it back up";
    default:
      return "Loop this spot slowly a few times, then try the phrase again";
  }
}

function coachFromEvent(event: PieceFeedbackEventV1): string {
  return `${event.explanation} Stay with ${whereFromEvent(event).toLowerCase()} until it feels easier.`;
}

/** Normalize older stored events that may lack severity. */
export function normalizeFeedbackEvent(
  event: PieceFeedbackEventV1,
): PieceFeedbackEventV1 {
  return {
    ...event,
    severity:
      event.severity ?? severityFromImportance(event.importance ?? 0.5),
  };
}

export function coachFocusItemFromEvent(
  event: PieceFeedbackEventV1,
): PieceCoachFocusItemV1 {
  const normalized = normalizeFeedbackEvent(event);
  return {
    eventId: normalized.eventId,
    category: normalized.category,
    kind: normalized.kind,
    severity: normalized.severity,
    confidence: normalized.confidence,
    measure: normalized.measure,
    beat: normalized.beat,
    noteIndex: normalized.noteIndex,
    onsetQuarters: normalized.onsetQuarters,
    recordingTimeSec: normalized.recordingTimeSec,
    explanation: normalized.explanation,
    improveFirst: improveFirstFromKind(normalized.kind),
    where: whereFromEvent(normalized),
    what: whatFromKind(normalized.kind, normalized.explanation),
    practise: practiseFromKind(normalized.kind),
    coach: coachFromEvent(normalized),
  };
}

export function buildPieceCoachContext(
  report: PieceFeedbackReportV1,
  focusLimit = 5,
): PieceCoachContextV1 {
  const events = report.events.map(normalizeFeedbackEvent);
  const skillsReady = report.skills
    .filter((s) => s.status === "ready")
    .map((s) => s.category);
  const skillsNotReady = PIECE_FEEDBACK_CATEGORIES.filter(
    (c) => !skillsReady.includes(c),
  );
  return {
    schemaVersion: PIECE_COACH_CONTEXT_SCHEMA_VERSION,
    pieceId: report.pieceId,
    attemptId: report.attemptId,
    skillsReady,
    skillsNotReady: [...skillsNotReady],
    events,
    focus: events.slice(0, focusLimit).map(coachFocusItemFromEvent),
  };
}
