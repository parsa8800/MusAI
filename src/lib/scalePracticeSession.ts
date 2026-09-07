import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { SCALE_PRACTICE_SESSION_VERSION } from "@/lib/scalePracticeTypes";

export const MUSAI_SCALE_PRACTICE_KEY = "musai-scale-practice-session-v1";
export const MUSAI_SCALE_HISTORY_KEY = "musai-scale-practice-history-v1";
export const SCALE_HISTORY_MAX = 8;

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

function readHistoryRaw(): ScalePracticeSessionV1[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(MUSAI_SCALE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parseScalePracticeSession(item))
      .filter((s): s is ScalePracticeSessionV1 => Boolean(s));
  } catch {
    return [];
  }
}

export function listScalePracticeHistory(): ScalePracticeSessionV1[] {
  return readHistoryRaw();
}

export function readScalePracticeHistoryEntry(
  sessionId: string,
): ScalePracticeSessionV1 | null {
  return readHistoryRaw().find((s) => s.sessionId === sessionId) ?? null;
}

/** Newest first. Dedupes by sessionId. Caps at SCALE_HISTORY_MAX. */
export function pushScalePracticeHistory(session: ScalePracticeSessionV1): void {
  if (typeof localStorage === "undefined") return;
  if (!parseScalePracticeSession(session)) return;
  const next = [
    session,
    ...readHistoryRaw().filter((s) => s.sessionId !== session.sessionId),
  ].slice(0, SCALE_HISTORY_MAX);
  localStorage.setItem(MUSAI_SCALE_HISTORY_KEY, JSON.stringify(next));
}

export function removeScalePracticeHistoryEntry(sessionId: string): void {
  if (typeof localStorage === "undefined") return;
  const next = readHistoryRaw().filter((s) => s.sessionId !== sessionId);
  if (next.length === 0) {
    localStorage.removeItem(MUSAI_SCALE_HISTORY_KEY);
    return;
  }
  localStorage.setItem(MUSAI_SCALE_HISTORY_KEY, JSON.stringify(next));
}

export function clearScalePracticeHistory(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MUSAI_SCALE_HISTORY_KEY);
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
