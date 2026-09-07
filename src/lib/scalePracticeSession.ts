import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { parseScalePracticeSession } from "@/lib/parseScalePracticeSession";
import {
  clearScaleProgressHistory,
  flattenScaleProgressAttempts,
  listScaleProgressJourneys,
  pushScaleProgressAttempt,
  readScaleProgressAttempt,
  removeScaleProgressJourney,
} from "@/lib/scaleProgressHistory";

export { parseScalePracticeSession } from "@/lib/parseScalePracticeSession";
export {
  clearScaleProgressHistory,
  formatLastPractised,
  getScaleProgressJourney,
  listScaleProgressJourneys,
  removeScaleProgressJourney,
  type ScaleProgressJourneyV1,
} from "@/lib/scaleProgressHistory";

export const MUSAI_SCALE_PRACTICE_KEY = "musai-scale-practice-session-v1";
/** @deprecated Prefer progress journeys; kept for migration alias. */
export const MUSAI_SCALE_HISTORY_KEY = "musai-scale-practice-history-v1";
/** Soft cap for flattened list consumers. */
export const SCALE_HISTORY_MAX = 48;

export function persistScalePracticeSession(data: ScalePracticeSessionV1): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(MUSAI_SCALE_PRACTICE_KEY, JSON.stringify(data));
  pushScalePracticeHistory(data);
}

export function readScalePracticeSession(): ScalePracticeSessionV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MUSAI_SCALE_PRACTICE_KEY);
    if (!raw) return null;
    return parseScalePracticeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearScalePracticeSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(MUSAI_SCALE_PRACTICE_KEY);
}

/** Newest-first flat list for comparison helpers and legacy callers. */
export function listScalePracticeHistory(): ScalePracticeSessionV1[] {
  return flattenScaleProgressAttempts().slice(0, SCALE_HISTORY_MAX);
}

export function readScalePracticeHistoryEntry(
  sessionId: string,
): ScalePracticeSessionV1 | null {
  return readScaleProgressAttempt(sessionId);
}

/** Appends into the scale's journey (grouped by scaleId). */
export function pushScalePracticeHistory(session: ScalePracticeSessionV1): void {
  pushScaleProgressAttempt(session);
}

/** Removes one attempt; drops the journey if no attempts remain. */
export function removeScalePracticeHistoryEntry(sessionId: string): void {
  if (typeof localStorage === "undefined") return;
  const journey = listScaleProgressJourneys().find((j) =>
    j.attempts.some((a) => a.sessionId === sessionId),
  );
  if (!journey) return;
  const remaining = journey.attempts.filter((a) => a.sessionId !== sessionId);
  removeScaleProgressJourney(journey.progressKey);
  for (const attempt of remaining) {
    pushScaleProgressAttempt(attempt);
  }
}

export function clearScalePracticeHistory(): void {
  clearScaleProgressHistory();
}

export function formatScaleTakeSubtitle(session: ScalePracticeSessionV1): string {
  const span = session.octaveSpan === 2 ? "2 octaves" : "1 octave";
  const source =
    session.scaleSource === "detected"
      ? "Detected"
      : session.scaleSource === "selected"
        ? "Selected"
        : null;
  return source ? `${source} · ${span}` : span;
}
