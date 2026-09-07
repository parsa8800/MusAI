import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { SCALE_PRACTICE_SESSION_VERSION } from "@/lib/scalePracticeTypes";

/** Shared session contract check for results, history, and APIs. */
export function parseScalePracticeSession(
  raw: unknown,
): ScalePracticeSessionV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as ScalePracticeSessionV1;
  if (
    v.schemaVersion !== SCALE_PRACTICE_SESSION_VERSION ||
    typeof v.sessionId !== "string" ||
    v.exerciseType !== "scale_practice" ||
    !Array.isArray(v.notes) ||
    !Array.isArray(v.expectedNotesMidi) ||
    !v.summary ||
    typeof v.scaleLabel !== "string" ||
    typeof v.rootMidi !== "number"
  ) {
    return null;
  }
  if (v.notes.length !== v.expectedNotesMidi.length) return null;
  return v;
}
