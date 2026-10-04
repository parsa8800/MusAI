import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import {
  findRhythmFindings,
  type RhythmFinding,
} from "@/features/piece-studio/feedback/analyzers/rhythmTiming";
import { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";

function heardAttackSec(
  match: { attackSec?: Array<number | null>; timesSec: Array<number | null> } | undefined,
  index: number,
): number | null {
  if (!match) return null;
  const times = match.attackSec ?? match.timesSec;
  const time = times[index];
  return typeof time === "number" && Number.isFinite(time) ? time : null;
}

function placePhrase(measure: string | null, beat: number | null): string {
  if (!measure) return "This note";
  if (beat == null || !Number.isFinite(beat)) return `Bar ${measure}`;
  const rounded = Math.round(beat * 10) / 10;
  const beatLabel = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `Bar ${measure}, beat ${beatLabel}`;
}

function rhythmExplanation(
  finding: RhythmFinding,
  measure: string | null,
  beat: number | null,
): string {
  const place = placePhrase(measure, beat);
  if (finding.kind === "early") return `${place} started a little early.`;
  if (finding.kind === "late") return `${place} started a little late.`;
  if (finding.length === "long") return `${place} was held too long.`;
  return `${place} was cut short.`;
}

function importanceFor(finding: RhythmFinding): number {
  if (finding.kind === "duration") {
    return Math.max(0.62, Math.min(0.84, 0.55 + finding.overshoot * 0.35));
  }
  return Math.max(0.48, Math.min(0.78, 0.46 + finding.overshoot * 0.4));
}

/**
 * Rhythm only: early, late, and clearly wrong length.
 * Uses the shared pitch match times. Does not run pitch detection again.
 * A take with no beat to compare stays not ready.
 */
export const RhythmAnalyzer: PieceFeedbackAnalyzer = {
  category: "rhythm",
  analyze(input) {
    const expected = input.expectedNotes;
    if (!input.pitchMatch || expected.length === 0) {
      return { category: "rhythm", status: "not_ready", events: [] };
    }
    const findings = findRhythmFindings(
      expected.map((note, i) => ({
        noteIndex: note.noteIndex,
        absoluteOnsetQuarters: note.absoluteOnsetQuarters,
        heardSec: heardAttackSec(input.pitchMatch, i),
        midi: note.midi,
      })),
    );
    if (!findings) {
      return { category: "rhythm", status: "not_ready", events: [] };
    }

    const byIndex = new Map<number, PieceExpectedNote>(
      expected.map((note) => [note.noteIndex, note]),
    );
    const events = findings.map((finding) => {
      const note = byIndex.get(finding.noteIndex);
      return createFeedbackEvent({
        eventId: `rhythm-${finding.noteIndex}-${finding.kind}`,
        category: "rhythm",
        kind: finding.kind,
        measure: note?.measure ?? null,
        beat: note?.beat ?? null,
        noteIndex: finding.noteIndex,
        onsetQuarters: note?.onsetQuarters ?? null,
        recordingTimeSec: input.pitchMatch?.timesSec[finding.noteIndex] ?? null,
        confidence: 0.7,
        importance: importanceFor(finding),
        explanation: rhythmExplanation(finding, note?.measure ?? null, note?.beat ?? null),
      });
    });
    return { category: "rhythm", status: "ready", events };
  },
};
