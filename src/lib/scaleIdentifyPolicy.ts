import { SCALE_IDENTIFY } from "@/lib/scaleIdentifyConfig";
import type { ScaleKind } from "@/lib/scales";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";
import type { ScaleWorkspaceIdentity } from "@/lib/scaleWorkspace";
import {
  candidateMatchesHint,
  hintFromCandidate,
  type DetectScaleResult,
  type ScaleCandidate,
  type ScaleIdentityHint,
} from "@/lib/detectScale";

export type { ScaleIdentityHint };

export type RivalStreak = {
  hint: ScaleIdentityHint;
  count: number;
};

export type ScaleIdentifyContext = {
  /** Locked practice scale, if the student has already named one. */
  active: ScaleIdentityHint | null;
  /** True once a scale is the practice context (workspace, pick-notes, or later takes). */
  established: boolean;
  /** Consecutive prior takes that already voted for the same rival. */
  rivalStreak: RivalStreak | null;
};

export type ScaleIdentifyDecision =
  | { kind: "auto"; candidate: ScaleCandidate }
  | { kind: "confirm"; alternatives: ScaleCandidate[] }
  | {
      kind: "keep_active";
      /** Convincing rival this take, or null when the locked scale still fits. */
      rivalVote: ScaleIdentityHint | null;
    }
  | {
      kind: "suggest";
      candidate: ScaleCandidate;
      rivalVote: ScaleIdentityHint;
    }
  | { kind: "fail"; reason: "no_pitch" | "no_match" };

export function identityKey(hint: ScaleIdentityHint): string {
  return `${hint.tonicPitchClass}:${hint.scaleKind}:${hint.octaveSpan}`;
}

export function sameIdentity(
  a: ScaleIdentityHint,
  b: ScaleIdentityHint,
): boolean {
  return identityKey(a) === identityKey(b);
}

export function hintFromWorkspace(
  identity: Pick<
    ScaleWorkspaceIdentity,
    "tonicPitchClass" | "scaleKind" | "octaveSpan"
  >,
): ScaleIdentityHint {
  return {
    tonicPitchClass: identity.tonicPitchClass,
    scaleKind: identity.scaleKind,
    octaveSpan: identity.octaveSpan,
  };
}

export function hintFromSession(
  session: Pick<
    ScalePracticeSessionV1,
    "tonicPitchClass" | "scaleKind" | "octaveSpan"
  >,
): ScaleIdentityHint {
  return {
    tonicPitchClass: session.tonicPitchClass,
    scaleKind: session.scaleKind,
    octaveSpan: session.octaveSpan,
  };
}

export function hintFromPicker(input: {
  tonicPitchClass: number;
  scaleKind: ScaleKind;
  octaveSpan: 1 | 2;
}): ScaleIdentityHint {
  return {
    tonicPitchClass: input.tonicPitchClass,
    scaleKind: input.scaleKind,
    octaveSpan: input.octaveSpan,
  };
}

export function nextRivalStreak(
  previous: RivalStreak | null,
  vote: ScaleIdentityHint | null,
): RivalStreak | null {
  if (!vote) return null;
  if (previous && sameIdentity(previous.hint, vote)) {
    return { hint: vote, count: previous.count + 1 };
  }
  return { hint: vote, count: 1 };
}

function coverage(candidate: ScaleCandidate): number {
  const expected = Math.max(1, candidate.expectedMidis.length);
  return candidate.analysis.summary.notesAnalyzed / expected;
}

function familyDiffers(a: ScaleIdentityHint, b: ScaleIdentityHint): boolean {
  return a.tonicPitchClass !== b.tonicPitchClass || a.scaleKind !== b.scaleKind;
}

/**
 * Active scale is a poor account of this take, and another scale is a
 * strong one. One messy note must not pass this bar.
 */
export function isConvincingRival(
  detected: Extract<DetectScaleResult, { ok: true }>,
  active: ScaleIdentityHint,
): boolean {
  const best = detected.best;
  if (!familyDiffers(hintFromCandidate(best), active)) return false;
  if (best.rankScore < SCALE_IDENTIFY.rivalStrongRank) return false;
  if (best.analysis.summary.notesAnalyzed < SCALE_IDENTIFY.rivalMinNotes) {
    return false;
  }
  if (coverage(best) < 0.45) return false;

  const hinted = detected.hinted;
  const activeRank = hinted?.rankScore ?? Number.NEGATIVE_INFINITY;
  const activePoor =
    !hinted ||
    activeRank <= SCALE_IDENTIFY.activePoorRank ||
    best.rankScore - activeRank >= SCALE_IDENTIFY.activeLosesBy;
  return activePoor;
}

/** One card per scale + octave (pattern is an exercise detail, not a choice). */
export function uniqueConfirmChoices(
  alternatives: readonly ScaleCandidate[],
): ScaleCandidate[] {
  const out: ScaleCandidate[] = [];
  for (const candidate of alternatives) {
    if (
      out.some(
        (u) =>
          u.tonicPitchClass === candidate.tonicPitchClass &&
          u.scaleKind === candidate.scaleKind &&
          u.octaveSpan === candidate.octaveSpan,
      )
    ) {
      continue;
    }
    out.push(candidate);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Index of the detector’s suggested card, or -1 when the top two are
 * too close to single one out.
 */
export function suggestedConfirmIndex(
  alternatives: readonly ScaleCandidate[],
): number {
  const choices = uniqueConfirmChoices(alternatives);
  if (choices.length < 2) return -1;
  const best = choices[0]!;
  const second = choices[1]!;
  if (best.rankScore - second.rankScore >= SCALE_IDENTIFY.firstTakeSuggestLead) {
    return 0;
  }
  return -1;
}

export function decideScaleIdentify(
  detected: DetectScaleResult,
  context: ScaleIdentifyContext,
): ScaleIdentifyDecision {
  if (!context.established || !context.active) {
    if (!detected.ok) return { kind: "fail", reason: detected.reason };
    if (detected.ambiguous) {
      return { kind: "confirm", alternatives: detected.alternatives };
    }
    return { kind: "auto", candidate: detected.best };
  }

  const active = context.active;
  if (!detected.ok) {
    return { kind: "keep_active", rivalVote: null };
  }

  if (candidateMatchesHint(detected.best, active)) {
    return { kind: "keep_active", rivalVote: null };
  }

  // Same tonic + kind, different octave: stay put. Range is a setting.
  if (
    detected.best.tonicPitchClass === active.tonicPitchClass &&
    detected.best.scaleKind === active.scaleKind
  ) {
    return { kind: "keep_active", rivalVote: null };
  }

  if (!isConvincingRival(detected, active)) {
    return { kind: "keep_active", rivalVote: null };
  }

  const rivalVote = hintFromCandidate(detected.best);
  const streak = nextRivalStreak(context.rivalStreak, rivalVote);
  if (streak && streak.count >= SCALE_IDENTIFY.consecutiveRivalTakes) {
    return { kind: "suggest", candidate: detected.best, rivalVote };
  }
  return { kind: "keep_active", rivalVote };
}

export type ShownScaleTake =
  | { action: "score_active"; rivalVote: ScaleIdentityHint | null }
  | { action: "open"; candidate: ScaleCandidate }
  | { action: "confirm"; alternatives: ScaleCandidate[] }
  | { action: "fail"; reason: "no_pitch" | "no_match" };

/**
 * What the practice page should do with one take.
 * A scale already on the page is scored there. Suggesting a rival does not
 * change the title, key, or staff, and does not open the picker.
 * Auto-detect and the picker are for a first take when nothing is chosen.
 */
export function resolveShownScaleTake(
  decision: ScaleIdentifyDecision,
): ShownScaleTake {
  switch (decision.kind) {
    case "keep_active":
      return { action: "score_active", rivalVote: decision.rivalVote };
    case "suggest":
      return { action: "score_active", rivalVote: decision.rivalVote };
    case "auto":
      return { action: "open", candidate: decision.candidate };
    case "confirm":
      return { action: "confirm", alternatives: decision.alternatives };
    case "fail":
      return { action: "fail", reason: decision.reason };
  }
}
