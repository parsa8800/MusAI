import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import { parseScalePracticeSession } from "@/lib/parseScalePracticeSession";
import { progressKeyFor } from "@/lib/scaleWorkspace";

export const MUSAI_SCALE_PROGRESS_KEY = "musai-scale-progress-v1";
/** Legacy flat list — migrated on first progress read. */
export const MUSAI_SCALE_HISTORY_LEGACY_KEY = "musai-scale-practice-history-v1";

export const SCALE_PROGRESS_SCHEMA_VERSION = 1 as const;
export const SCALE_PROGRESS_MAX_JOURNEYS = 12;
export const SCALE_PROGRESS_MAX_ATTEMPTS = 24;

export type ScaleProgressJourneyV1 = {
  schemaVersion: typeof SCALE_PROGRESS_SCHEMA_VERSION;
  /** Groups practice by scaleId + octave span. */
  progressKey: string;
  scaleId: string;
  scaleLabel: string;
  scaleKind: "major" | "natural_minor";
  tonicPitchClass: number;
  /** Oldest → newest. Full sessions preserve note feedback. */
  attempts: ScalePracticeSessionV1[];
  bestInTunePercent: number;
  lastPractisedAt: string;
  lastOctaveSpan: 1 | 2;
  lastRootMidi: number;
  lastOctaveRangeLabel: string;
};

function isScaleKind(v: unknown): v is "major" | "natural_minor" {
  return v === "major" || v === "natural_minor";
}

export function progressKeyForSession(session: ScalePracticeSessionV1): string {
  return progressKeyFor(session.scaleId, session.octaveSpan);
}

function isOctaveAwareKey(progressKey: string): boolean {
  return /__(1|2)$/.test(progressKey);
}

export function parseScaleProgressJourney(
  raw: unknown,
): ScaleProgressJourneyV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as ScaleProgressJourneyV1;
  if (
    v.schemaVersion !== SCALE_PROGRESS_SCHEMA_VERSION ||
    typeof v.progressKey !== "string" ||
    typeof v.scaleId !== "string" ||
    typeof v.scaleLabel !== "string" ||
    !isScaleKind(v.scaleKind) ||
    typeof v.tonicPitchClass !== "number" ||
    !Array.isArray(v.attempts) ||
    typeof v.bestInTunePercent !== "number" ||
    typeof v.lastPractisedAt !== "string" ||
    (v.lastOctaveSpan !== 1 && v.lastOctaveSpan !== 2) ||
    typeof v.lastRootMidi !== "number" ||
    typeof v.lastOctaveRangeLabel !== "string"
  ) {
    return null;
  }
  const attempts = v.attempts
    .map((a) => parseScalePracticeSession(a))
    .filter((a): a is ScalePracticeSessionV1 => Boolean(a));
  if (attempts.length === 0) return null;
  return { ...v, attempts };
}

function summarizeJourney(
  base: Omit<ScaleProgressJourneyV1, "attempts" | "bestInTunePercent" | "lastPractisedAt" | "lastOctaveSpan" | "lastRootMidi" | "lastOctaveRangeLabel"> & {
    attempts: ScalePracticeSessionV1[];
  },
): ScaleProgressJourneyV1 {
  const attempts = base.attempts;
  const last = attempts[attempts.length - 1]!;
  const bestInTunePercent = Math.max(
    ...attempts.map((a) => a.summary.inTunePercent),
  );
  return {
    ...base,
    schemaVersion: SCALE_PROGRESS_SCHEMA_VERSION,
    bestInTunePercent,
    lastPractisedAt: last.recordedAt,
    lastOctaveSpan: last.octaveSpan,
    lastRootMidi: last.rootMidi,
    lastOctaveRangeLabel: last.octaveRangeLabel,
  };
}

export function buildJourneyFromAttempts(
  attemptsNewestFirst: ScalePracticeSessionV1[],
): ScaleProgressJourneyV1 | null {
  if (attemptsNewestFirst.length === 0) return null;
  const chronological = [...attemptsNewestFirst].reverse();
  const first = chronological[0]!;
  return summarizeJourney({
    schemaVersion: SCALE_PROGRESS_SCHEMA_VERSION,
    progressKey: progressKeyForSession(first),
    scaleId: first.scaleId,
    scaleLabel: first.scaleLabel,
    scaleKind: first.scaleKind,
    tonicPitchClass: first.tonicPitchClass,
    attempts: chronological,
  });
}

/** Group flat newest-first sessions into journeys (newest practised first). */
export function groupSessionsIntoJourneys(
  sessionsNewestFirst: ScalePracticeSessionV1[],
): ScaleProgressJourneyV1[] {
  const byKey = new Map<string, ScalePracticeSessionV1[]>();
  const order: string[] = [];
  for (const s of sessionsNewestFirst) {
    const key = progressKeyForSession(s);
    const list = byKey.get(key);
    if (!list) {
      byKey.set(key, [s]);
      order.push(key);
    } else {
      list.push(s);
    }
  }
  return order
    .map((key) => buildJourneyFromAttempts(byKey.get(key)!))
    .filter((j): j is ScaleProgressJourneyV1 => Boolean(j));
}

function readProgressRaw(): ScaleProgressJourneyV1[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(MUSAI_SCALE_PROGRESS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parseScaleProgressJourney(item))
      .filter((j): j is ScaleProgressJourneyV1 => Boolean(j));
  } catch {
    return [];
  }
}

function writeProgress(journeys: ScaleProgressJourneyV1[]): void {
  if (typeof localStorage === "undefined") return;
  if (journeys.length === 0) {
    localStorage.removeItem(MUSAI_SCALE_PROGRESS_KEY);
    return;
  }
  localStorage.setItem(MUSAI_SCALE_PROGRESS_KEY, JSON.stringify(journeys));
}

function readLegacyFlatSessions(): ScalePracticeSessionV1[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(MUSAI_SCALE_HISTORY_LEGACY_KEY);
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

/** Load journeys, migrating legacy flat / pre-octave keys if needed. */
export function listScaleProgressJourneys(): ScaleProgressJourneyV1[] {
  const existing = readProgressRaw();
  if (existing.length > 0) {
    const needsOctaveSplit = existing.some(
      (j) => !isOctaveAwareKey(j.progressKey),
    );
    if (!needsOctaveSplit) return existing;

    const flat: ScalePracticeSessionV1[] = [];
    for (const j of existing) {
      for (let i = j.attempts.length - 1; i >= 0; i--) {
        flat.push(j.attempts[i]!);
      }
    }
    flat.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
    const migrated = groupSessionsIntoJourneys(flat).slice(
      0,
      SCALE_PROGRESS_MAX_JOURNEYS,
    );
    writeProgress(migrated);
    return migrated;
  }

  const legacy = readLegacyFlatSessions();
  if (legacy.length === 0) return [];

  const migrated = groupSessionsIntoJourneys(legacy).slice(
    0,
    SCALE_PROGRESS_MAX_JOURNEYS,
  );
  writeProgress(migrated);
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(MUSAI_SCALE_HISTORY_LEGACY_KEY);
  }
  return migrated;
}

export function getScaleProgressJourney(
  progressKey: string,
): ScaleProgressJourneyV1 | null {
  return (
    listScaleProgressJourneys().find((j) => j.progressKey === progressKey) ??
    null
  );
}

export function readScaleProgressAttempt(
  sessionId: string,
): ScalePracticeSessionV1 | null {
  for (const journey of listScaleProgressJourneys()) {
    const hit = journey.attempts.find((a) => a.sessionId === sessionId);
    if (hit) return hit;
  }
  return null;
}

/** Flatten journeys to newest-first sessions (compat / comparison helpers). */
export function flattenScaleProgressAttempts(): ScalePracticeSessionV1[] {
  const out: ScalePracticeSessionV1[] = [];
  for (const journey of listScaleProgressJourneys()) {
    for (let i = journey.attempts.length - 1; i >= 0; i--) {
      out.push(journey.attempts[i]!);
    }
  }
  out.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  return out;
}

export function pushScaleProgressAttempt(session: ScalePracticeSessionV1): void {
  if (typeof localStorage === "undefined") return;
  if (!parseScalePracticeSession(session)) return;

  const key = progressKeyForSession(session);
  const journeys = listScaleProgressJourneys();
  const existingIdx = journeys.findIndex((j) => j.progressKey === key);

  let nextJourney: ScaleProgressJourneyV1;
  if (existingIdx >= 0) {
    const prev = journeys[existingIdx]!;
    const withoutDup = prev.attempts.filter(
      (a) => a.sessionId !== session.sessionId,
    );
    const attempts = [...withoutDup, session].slice(
      -SCALE_PROGRESS_MAX_ATTEMPTS,
    );
    nextJourney = summarizeJourney({
      schemaVersion: SCALE_PROGRESS_SCHEMA_VERSION,
      progressKey: key,
      scaleId: session.scaleId,
      scaleLabel: session.scaleLabel,
      scaleKind: session.scaleKind,
      tonicPitchClass: session.tonicPitchClass,
      attempts,
    });
  } else {
    nextJourney = summarizeJourney({
      schemaVersion: SCALE_PROGRESS_SCHEMA_VERSION,
      progressKey: key,
      scaleId: session.scaleId,
      scaleLabel: session.scaleLabel,
      scaleKind: session.scaleKind,
      tonicPitchClass: session.tonicPitchClass,
      attempts: [session],
    });
  }

  const others = journeys.filter((j) => j.progressKey !== key);
  writeProgress(
    [nextJourney, ...others].slice(0, SCALE_PROGRESS_MAX_JOURNEYS),
  );
}

export function removeScaleProgressJourney(progressKey: string): void {
  if (typeof localStorage === "undefined") return;
  writeProgress(
    listScaleProgressJourneys().filter((j) => j.progressKey !== progressKey),
  );
}

export function clearScaleProgressHistory(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MUSAI_SCALE_PROGRESS_KEY);
  localStorage.removeItem(MUSAI_SCALE_HISTORY_LEGACY_KEY);
}

/** Relative day label for journey lists (UTC calendar days). */
export function formatLastPractised(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const startOfUtcDay = (x: Date) =>
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diffDays = Math.round(
    (startOfUtcDay(now) - startOfUtcDay(d)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()] ?? ""}`;
}

export function attemptNumberInJourney(
  journey: ScaleProgressJourneyV1,
  sessionId: string,
): number {
  const idx = journey.attempts.findIndex((a) => a.sessionId === sessionId);
  return idx >= 0 ? idx + 1 : journey.attempts.length;
}
