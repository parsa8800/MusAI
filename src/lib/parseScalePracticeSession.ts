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
  let session: ScalePracticeSessionV1 = v;
  if (
    typeof v.masteryPercentAfterTake === "number" &&
    Number.isFinite(v.masteryPercentAfterTake)
  ) {
    session = {
      ...session,
      masteryPercentAfterTake: Math.max(
        0,
        Math.min(100, Math.round(v.masteryPercentAfterTake)),
      ),
    };
  } else {
    const { masteryPercentAfterTake: _drop, ...rest } = session;
    session = rest;
  }
  if (!Array.isArray(v.waveformAmplitudes)) return session;
  const waveformAmplitudes = v.waveformAmplitudes
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .map((n) => Math.min(1, Math.max(0, n)))
    .slice(0, 300);
  return waveformAmplitudes.length > 0
    ? { ...session, waveformAmplitudes }
    : { ...session, waveformAmplitudes: undefined };
}
