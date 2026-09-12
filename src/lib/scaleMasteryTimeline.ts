import {
  buildLoopMastery,
  clampMastery,
} from "@/lib/scalePracticeProgress";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

/**
 * Stamp the running mastery after this take (chronological prior + session).
 * Does not mutate prior takes — read-only historical viewing stays safe.
 */
export function withMasteryAfterTake(
  session: ScalePracticeSessionV1,
  priorChronological: ScalePracticeSessionV1[],
): ScalePracticeSessionV1 {
  const percent = buildLoopMastery([...priorChronological, session]).percent;
  return {
    ...session,
    masteryPercentAfterTake: percent,
  };
}

/**
 * Mastery as of a specific take in a chronological attempt list.
 * Prefers the stored snapshot; falls back to folding attempts through that take.
 */
export function masteryPercentThroughTake(
  attemptsChronological: ScalePracticeSessionV1[],
  throughSessionId: string,
): number {
  const idx = attemptsChronological.findIndex(
    (a) => a.sessionId === throughSessionId,
  );
  if (idx < 0) {
    return buildLoopMastery(attemptsChronological).percent;
  }
  const take = attemptsChronological[idx]!;
  if (
    typeof take.masteryPercentAfterTake === "number" &&
    Number.isFinite(take.masteryPercentAfterTake)
  ) {
    return Math.round(clampMastery(take.masteryPercentAfterTake));
  }
  return buildLoopMastery(attemptsChronological.slice(0, idx + 1)).percent;
}
