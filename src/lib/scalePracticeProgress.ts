import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
  ScalePracticeSummary,
} from "@/lib/scalePracticeTypes";
import { listScalePracticeHistory } from "@/lib/scalePracticeSession";

/** Constructive practice stages — never “Needs work”. */
export type PracticeStageId =
  | "getting_started"
  | "building"
  | "getting_steadier"
  | "strong"
  | "excellent";

export type PracticeStage = {
  id: PracticeStageId;
  label: string;
  /** 0–1 fill for the soft progress ring (not a raw score). */
  fill: number;
};

export type AttemptProgress = {
  line: string;
  kind: "first" | "up" | "same" | "down";
};

const STAGES: PracticeStage[] = [
  { id: "getting_started", label: "Getting started", fill: 0.18 },
  { id: "building", label: "Building", fill: 0.38 },
  { id: "getting_steadier", label: "Getting steadier", fill: 0.58 },
  { id: "strong", label: "Strong", fill: 0.78 },
  { id: "excellent", label: "Excellent", fill: 1 },
];

export function countInTuneNotes(notes: ScalePracticeNoteRow[]): number {
  return notes.filter(
    (n) => !n.missingData && n.intonationBucket === "in_tune",
  ).length;
}

/** Map measured pitch accuracy into a motivating stage (honest, not harsh). */
export function practiceStageFromSummary(
  summary: ScalePracticeSummary,
): PracticeStage {
  if (summary.notesAnalyzed === 0) return STAGES[0]!;
  const p = summary.inTunePercent;
  if (p >= 90) return STAGES[4]!;
  if (p >= 75) return STAGES[3]!;
  if (p >= 55) return STAGES[2]!;
  if (p >= 30) return STAGES[1]!;
  return STAGES[0]!;
}

/**
 * Previous take for comparison: same scaleId preferred, else most recent other take.
 * History is newest-first and includes the current session at [0].
 */
export function findPreviousComparableTake(
  current: ScalePracticeSessionV1,
  history: ScalePracticeSessionV1[] = listScalePracticeHistory(),
): ScalePracticeSessionV1 | null {
  const others = history.filter((s) => s.sessionId !== current.sessionId);
  if (others.length === 0) return null;
  const sameWorkspace = others.find(
    (s) =>
      s.scaleId === current.scaleId && s.octaveSpan === current.octaveSpan,
  );
  if (sameWorkspace) return sameWorkspace;
  const sameScale = others.find((s) => s.scaleId === current.scaleId);
  return sameScale ?? others[0] ?? null;
}

export function buildAttemptProgress(
  current: ScalePracticeSessionV1,
  previous: ScalePracticeSessionV1 | null,
): AttemptProgress {
  if (!previous) {
    return {
      kind: "first",
      line: "First take logged — each retry builds your ear",
    };
  }

  const curIn = countInTuneNotes(current.notes);
  const prevIn = countInTuneNotes(previous.notes);
  const deltaNotes = curIn - prevIn;
  const deltaPct =
    current.summary.inTunePercent - previous.summary.inTunePercent;
  const sameScale = previous.scaleId === current.scaleId;

  if (deltaNotes >= 2) {
    return {
      kind: "up",
      line: `${deltaNotes} more notes in tune than last time`,
    };
  }
  if (deltaNotes === 1) {
    return {
      kind: "up",
      line: "One more note in tune than last time",
    };
  }
  if (deltaPct >= 8) {
    return {
      kind: "up",
      line: sameScale
        ? "Pitch improved this attempt"
        : "Pitch clearer than your last take",
    };
  }
  if (deltaNotes <= -2 || deltaPct <= -12) {
    return {
      kind: "down",
      line: "A tougher take — use Next once, then try again",
    };
  }
  if (Math.abs(deltaNotes) <= 1 && Math.abs(deltaPct) < 8) {
    return {
      kind: "same",
      line: "Similar to last time — keep the streak going",
    };
  }
  if (deltaNotes > 0 || deltaPct > 0) {
    return { kind: "up", line: "Pitch improved this attempt" };
  }
  return {
    kind: "same",
    line: "Keep practising — small steps still count",
  };
}

/** Live practice-loop meta for Take N / delta / best chips. */
export type LoopAttemptMeta = {
  attemptNumber: number;
  previousAccuracy: number | null;
  /** Rounded percentage-point change vs previous attempt in this loop. */
  deltaPct: number | null;
  bestAccuracy: number;
  isNewBest: boolean;
  isFirst: boolean;
};

/**
 * Build loop chrome from chronological attempts (oldest → newest).
 * `attempts` should include the current take as the last entry.
 */
export function buildLoopAttemptMeta(
  attempts: ScalePracticeSessionV1[],
): LoopAttemptMeta {
  if (attempts.length === 0) {
    return {
      attemptNumber: 1,
      previousAccuracy: null,
      deltaPct: null,
      bestAccuracy: 0,
      isNewBest: false,
      isFirst: true,
    };
  }

  const current = attempts[attempts.length - 1]!;
  const previous =
    attempts.length >= 2 ? attempts[attempts.length - 2]! : null;
  const accuracies = attempts.map((s) => s.summary.inTunePercent);
  const bestAccuracy = Math.max(...accuracies);
  const curPct = current.summary.inTunePercent;
  const previousAccuracy = previous
    ? previous.summary.inTunePercent
    : null;
  const deltaPct =
    previousAccuracy == null
      ? null
      : Math.round(curPct - previousAccuracy);
  const earlierBest =
    attempts.length <= 1
      ? null
      : Math.max(...accuracies.slice(0, -1));
  const isNewBest =
    earlierBest != null && curPct > earlierBest;

  return {
    attemptNumber: attempts.length,
    previousAccuracy,
    deltaPct,
    bestAccuracy: Math.round(bestAccuracy),
    isNewBest: Boolean(isNewBest),
    isFirst: attempts.length === 1,
  };
}
