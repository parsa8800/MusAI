import { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";
import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import type { PieceFeedbackKind } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import { centsFromMatchedHz } from "@/features/piece-studio/pitch/centsFromMatchedHz";
import { matchPiecePitch } from "@/features/piece-studio/pitch/piecePitchMatch";
import {
  PRACTICE_CLEAR_MISS_CENTS,
  PRACTICE_IN_TUNE_CENTS,
} from "@/lib/intonationScore";

function barPhrase(measure: string | null): string {
  if (!measure) return "This note";
  return `Bar ${measure}`;
}

function pitchExplanation(
  kind: Extract<PieceFeedbackKind, "sharp" | "flat" | "missed">,
  measure: string | null,
): string {
  const bar = barPhrase(measure);
  if (kind === "missed") return `${bar} didn’t come through.`;
  if (kind === "sharp") return `${bar} ran a little high.`;
  return `${bar} sat a little low.`;
}

/**
 * Pitch only: sharp, flat, missed.
 * Unstable is reserved until note-level wobble is measured honestly.
 * Prefers a shared pitchMatch from analyzePieceTake when present.
 */
export const PitchAnalyzer: PieceFeedbackAnalyzer = {
  category: "pitch",
  analyze(input) {
    const expected = input.expectedNotes;
    if ((!input.audio && !input.pitchMatch) || expected.length === 0) {
      return { category: "pitch", status: "not_ready", events: [] };
    }
    const match =
      input.pitchMatch ??
      (input.audio
        ? matchPiecePitch({
            mono: input.audio.mono,
            sampleRateHz: input.audio.sampleRateHz,
            expectedMidis: expected.map((n) => n.midi),
          })
        : null);
    if (!match) {
      return { category: "pitch", status: "not_ready", events: [] };
    }

    const events = [];
    for (let i = 0; i < expected.length; i++) {
      const note = expected[i]!;
      const hz = match.slots[i];
      let kind: "sharp" | "flat" | "missed" | null = null;
      let cents: number | null = null;
      if (hz == null || !(hz > 0)) {
        kind = "missed";
      } else {
        ({ cents } = centsFromMatchedHz(hz, note.midi));
        if (Math.abs(cents) > PRACTICE_IN_TUNE_CENTS) {
          kind = cents > 0 ? "sharp" : "flat";
        }
      }
      if (!kind) continue;
      const abs = Math.abs(cents ?? 0);
      const importance =
        kind === "missed"
          ? 0.82
          : abs >= PRACTICE_CLEAR_MISS_CENTS
            ? 0.72
            : 0.48;
      events.push(
        createFeedbackEvent({
          eventId: `pitch-${note.noteIndex}-${kind}`,
          category: "pitch",
          kind,
          measure: note.measure,
          beat: note.beat,
          noteIndex: note.noteIndex,
          onsetQuarters: note.onsetQuarters,
          recordingTimeSec: match.timesSec[i] ?? null,
          confidence: kind === "missed" ? 0.55 : 0.72,
          importance,
          explanation: pitchExplanation(kind, note.measure),
        }),
      );
    }

    return { category: "pitch", status: "ready", events };
  },
};
