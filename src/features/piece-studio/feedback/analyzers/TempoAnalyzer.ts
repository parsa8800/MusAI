import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import {
  findTempoPace,
  tempoExplanation,
} from "@/features/piece-studio/feedback/analyzers/tempoTiming";
import { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";

function heardAttackSec(
  match: { attackSec?: Array<number | null>; timesSec: Array<number | null> } | undefined,
  index: number,
): number | null {
  if (!match) return null;
  const times = match.attackSec ?? match.timesSec;
  const time = times[index];
  return typeof time === "number" && Number.isFinite(time) ? time : null;
}

/**
 * Whole-piece tempo only. Words for the coach, not a mark on the notes.
 * A take with no beat to compare stays not ready.
 */
export const TempoAnalyzer: PieceFeedbackAnalyzer = {
  category: "tempo",
  analyze(input) {
    const expected = input.expectedNotes;
    if (!input.pitchMatch || expected.length === 0) {
      return { category: "tempo", status: "not_ready", events: [] };
    }
    const pace = findTempoPace(
      expected.map((note, i) => ({
        noteIndex: note.noteIndex,
        absoluteOnsetQuarters: note.absoluteOnsetQuarters,
        heardSec: heardAttackSec(input.pitchMatch, i),
      })),
      input.score?.tempoBpm ?? null,
    );
    if (!pace) {
      return { category: "tempo", status: "not_ready", events: [] };
    }
    return {
      category: "tempo",
      status: "ready",
      events: [
        createFeedbackEvent({
          eventId: `tempo-${pace.kind}-${pace.shape}`,
          category: "tempo",
          kind: pace.kind,
          measure: null,
          beat: null,
          noteIndex: null,
          onsetQuarters: null,
          recordingTimeSec: null,
          confidence: 0.7,
          importance: 0.7,
          explanation: tempoExplanation(pace),
        }),
      ],
    };
  },
};
