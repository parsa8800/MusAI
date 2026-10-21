/**
 * Scale identification knobs. Keep these here so detection UI and tests
 * share one definition of “close”, “poor”, and “convincing”.
 */
export const SCALE_IDENTIFY = {
  /**
   * First take of an unknown session: ask only when #2 is within this
   * many rank points of #1.
   */
  firstTakeCloseGap: 10,
  /**
   * Both first-take candidates must be at least this strong. Two weak
   * guesses are not “genuinely close possibilities”.
   */
  firstTakeMinRank: 36,
  /**
   * Within a close first-take pair, mark #1 as suggested when it leads
   * by at least this many rank points. Near-ties stay unmarked.
   */
  firstTakeSuggestLead: 4,
  /** Locked scale looks like a miss at or below this rank. */
  activePoorRank: 18,
  /** Rival must beat the locked scale by at least this many points. */
  activeLosesBy: 28,
  /** Rival itself must look like a real, well-covered scale. */
  rivalStrongRank: 48,
  rivalMinNotes: 6,
  /** Consecutive convincing rival takes before we mention a switch. */
  consecutiveRivalTakes: 2,
} as const;
