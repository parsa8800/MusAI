import type {
  ScalePracticeNoteRow,
  ScalePracticeSessionV1,
  ScalePracticeSummary,
} from "@/lib/scalePracticeTypes";
import { sameScaleExercise } from "@/lib/scaleTakeHistory";

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

/** A take counts as “great” for coach streaks (not a 100% unlock). */
export const GREAT_ACCURACY_PERCENT = 90;
/** Consecutive great takes shown to the coach — not used to award 100%. */
export const GREAT_TAKES_FOR_FULL = 3;

/** How fast mastery moves toward a stronger attempt, before remaining-ease. */
export const MASTERY_IMPROVE_RATE = 0.42;
/** How fast mastery eases down after a weaker attempt. */
export const MASTERY_REGRESS_RATE = 0.08;
/** Even gentler drop once mastery is already high. */
export const MASTERY_HIGH_REGRESS_RATE = 0.04;
export const MASTERY_HIGH_THRESHOLD = 90;

/** Extra crawl toward 100 when the take itself is already excellent. */
export const MASTERY_EXCELLENT_SCORE = 94;
export const MASTERY_EXCELLENT_PULL = 0.14;
/** Near the top, excellent takes still move a little so 100 is reachable. */
export const MASTERY_NEAR_TOP = 97;
export const MASTERY_NEAR_TOP_MIN_GAIN = 0.55;
/**
 * First take seeds the bar at the attempt score, but cannot claim 100%
 * unless the take is a fully correct great run (`isGreatAccuracyTake`).
 */
export const MASTERY_FIRST_TAKE_CAP = 92;

export const ATTEMPT_COMPLETION_WEIGHT = 0.4;
export const ATTEMPT_QUALITY_WEIGHT = 0.6;

export function clampMastery(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function isGreatAccuracyTake(
  session: Pick<ScalePracticeSessionV1, "notes" | "summary" | "expectedNotesMidi">,
): boolean {
  const expected = Math.max(
    1,
    session.expectedNotesMidi?.length ?? session.notes.length,
  );
  if (session.summary.notesAnalyzed <= 0) return false;
  if (session.summary.notesMissing > 0) return false;
  if (session.summary.notesAnalyzed < expected) return false;
  if (session.summary.inTunePercent < GREAT_ACCURACY_PERCENT) return false;
  if (session.summary.overallScore0to100 < 88) return false;
  return session.notes.every(
    (note) => !note.missingData && note.intonationBucket === "in_tune",
  );
}

/** Count of great takes at the end of the loop (breaks on the first miss). */
export function consecutiveGreatTakes(
  attempts: ScalePracticeSessionV1[],
): number {
  let streak = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (!isGreatAccuracyTake(attempts[i]!)) break;
    streak += 1;
  }
  return streak;
}

export type LoopMastery = {
  /** 0–100 scale mastery for the bar (not this take’s raw score). */
  percent: number;
  /** Combined completion × quality for the latest take. */
  attemptScore: number;
  greatStreak: number;
  needed: number;
};

export type AttemptScoreBreakdown = {
  /** 0–100: fraction of expected notes that were actually detected. */
  completionScore: number;
  /** 0–100: tuning quality of detected notes (no rhythm metric exists yet). */
  performanceScore: number;
  /** Combined attempt score used to update mastery. */
  attemptScore: number;
};

/**
 * Score one take from completion and performance, kept separate then combined.
 * Performance is weighted by how much of the scale was actually played so two
 * in-tune notes cannot look like mastery of a 15-note exercise.
 */
export function scoreScaleAttempt(
  session: Pick<
    ScalePracticeSessionV1,
    "notes" | "summary" | "expectedNotesMidi"
  >,
): AttemptScoreBreakdown {
  const expected = Math.max(
    1,
    session.expectedNotesMidi?.length ?? session.notes.length,
  );
  const analyzed = Math.max(0, session.summary.notesAnalyzed);
  const completionFrac = Math.min(1, analyzed / expected);
  const completionScore = 100 * completionFrac;

  if (analyzed <= 0) {
    return { completionScore: 0, performanceScore: 0, attemptScore: 0 };
  }

  const overall = clampMastery(session.summary.overallScore0to100);
  const inTune = clampMastery(session.summary.inTunePercent);
  const performanceScore = 0.75 * overall + 0.25 * inTune;
  const attemptScore = clampMastery(
    ATTEMPT_COMPLETION_WEIGHT * completionScore +
      ATTEMPT_QUALITY_WEIGHT * performanceScore * completionFrac,
  );

  return {
    completionScore: Math.round(completionScore * 10) / 10,
    performanceScore: Math.round(performanceScore * 10) / 10,
    attemptScore: Math.round(attemptScore * 10) / 10,
  };
}

/**
 * 1 at 0% mastery, shrinking toward ~0.16 as mastery nears 100.
 * Square-root-ish remaining room so early gains stay lively.
 */
export function masteryRemainingEase(current: number): number {
  const remaining = clampMastery(100 - clampMastery(current)) / 100;
  return 0.16 + 0.84 * remaining ** 0.55;
}

/**
 * Asymmetric smoothing with diminishing returns near 100%.
 * Stronger takes pull up faster than weak takes pull down.
 * A fully correct great take unlocks 100% immediately — no artificial grind.
 * Other first takes seed mastery at the attempt score, capped below 100.
 */
export function updateScaleMastery(
  currentMastery: number | null,
  attemptScore: number,
  opts?: { fullyCorrect?: boolean },
): number {
  const score = clampMastery(attemptScore);
  if (opts?.fullyCorrect) {
    return 100;
  }
  if (currentMastery == null) {
    return clampMastery(Math.min(score, MASTERY_FIRST_TAKE_CAP));
  }
  const current = clampMastery(currentMastery);
  const gap = score - current;
  const excellent = score >= MASTERY_EXCELLENT_SCORE;
  if (gap < 0 && !excellent) {
    const rate =
      current >= MASTERY_HIGH_THRESHOLD
        ? MASTERY_HIGH_REGRESS_RATE
        : MASTERY_REGRESS_RATE;
    return clampMastery(current + gap * rate);
  }

  const ease = masteryRemainingEase(current);
  let delta = Math.max(0, gap) * MASTERY_IMPROVE_RATE * ease;
  if (excellent) {
    delta += (100 - current) * MASTERY_EXCELLENT_PULL * ease;
  }
  if (excellent && current >= MASTERY_NEAR_TOP) {
    delta = Math.max(delta, MASTERY_NEAR_TOP_MIN_GAIN);
  }
  return clampMastery(current + delta);
}

function isSilentAttempt(
  session: Pick<ScalePracticeSessionV1, "summary">,
): boolean {
  return session.summary.notesAnalyzed <= 0;
}

function foldMastery(attempts: ScalePracticeSessionV1[]): {
  mastery: number;
  attemptScore: number;
} {
  let mastery: number | null = null;
  let attemptScore = 0;

  for (let i = 0; i < attempts.length; i++) {
    const take = attempts[i]!;
    attemptScore = scoreScaleAttempt(take).attemptScore;
    // Mic misses / silence should not rewrite mastery.
    if (isSilentAttempt(take)) continue;
    mastery = updateScaleMastery(mastery, attemptScore, {
      fullyCorrect: isGreatAccuracyTake(take),
    });
  }

  return {
    mastery: mastery ?? 0,
    attemptScore,
  };
}

/**
 * Longer-term mastery for this scale loop.
 * Improvement moves the bar up with smaller gains near 100%.
 * One weak take only eases it down a little.
 */
export function buildLoopMastery(
  attempts: ScalePracticeSessionV1[],
): LoopMastery {
  const needed = GREAT_TAKES_FOR_FULL;
  const greatStreak = consecutiveGreatTakes(attempts);
  if (attempts.length === 0) {
    return { percent: 0, attemptScore: 0, greatStreak: 0, needed };
  }
  const folded = foldMastery(attempts);
  return {
    percent: Math.round(folded.mastery),
    attemptScore: Math.round(folded.attemptScore),
    greatStreak,
    needed,
  };
}

/** Stage from loop mastery (100% after a fully correct take, or sustained excellence). */
export function practiceStageFromMastery(percent: number): PracticeStage {
  if (percent >= 100) return STAGES[4]!;
  if (percent >= 90) return { ...STAGES[3]!, fill: percent / 100 };
  if (percent >= 75) return STAGES[3]!;
  if (percent >= 55) return STAGES[2]!;
  if (percent >= 30) return STAGES[1]!;
  return STAGES[0]!;
}

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
 * Previous take for comparison: same scale exercise only
 * (scale + octave + direction). History is newest-first and includes
 * the current session at [0].
 */
export function findPreviousComparableTake(
  current: ScalePracticeSessionV1,
  history: ScalePracticeSessionV1[],
): ScalePracticeSessionV1 | null {
  const others = history.filter((s) => s.sessionId !== current.sessionId);
  return others.find((s) => sameScaleExercise(s, current)) ?? null;
}

export function buildAttemptProgress(
  current: ScalePracticeSessionV1,
  previous: ScalePracticeSessionV1 | null,
): AttemptProgress {
  if (!previous) {
    return {
      kind: "first",
      line: "",
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
