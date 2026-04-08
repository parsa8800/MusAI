import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { SCALE_PRACTICE_SESSION_VERSION } from "@/lib/scalePracticeTypes";

export const MUSAI_SCALE_PRACTICE_KEY = "musai-scale-practice-session-v1";

export function persistScalePracticeSession(data: ScalePracticeSessionV1): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(MUSAI_SCALE_PRACTICE_KEY, JSON.stringify(data));
}

export function readScalePracticeSession(): ScalePracticeSessionV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MUSAI_SCALE_PRACTICE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ScalePracticeSessionV1;
    if (
      v.schemaVersion !== SCALE_PRACTICE_SESSION_VERSION ||
      typeof v.sessionId !== "string" ||
      v.exerciseType !== "scale_practice" ||
      !Array.isArray(v.notes) ||
      !v.summary
    ) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function clearScalePracticeSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(MUSAI_SCALE_PRACTICE_KEY);
}
