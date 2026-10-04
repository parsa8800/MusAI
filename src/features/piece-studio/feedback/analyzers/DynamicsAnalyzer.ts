import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import {
  findDynamicFindings,
  type DynamicFinding,
} from "@/features/piece-studio/feedback/analyzers/dynamicsTiming";
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

const SOFT_MARKS = new Set(["ppp", "pp", "p", "mp"]);

function dynamicExplanation(finding: DynamicFinding): string {
  const soft = SOFT_MARKS.has(finding.mark);
  if (finding.kind === "too_loud") {
    return soft ? "The soft mark was too loud." : "This mark was too loud.";
  }
  return soft ? "The soft mark was too soft." : "The loud mark was too soft.";
}

function importanceFor(finding: DynamicFinding): number {
  return Math.max(0.5, Math.min(0.84, 0.55 + finding.overshootDb / 20));
}

/**
 * Dynamics only: a written mark played clearly too loud or too soft.
 * One written level cannot be judged, because mic gain has no comparison.
 */
export const DynamicsAnalyzer: PieceFeedbackAnalyzer = {
  category: "dynamics",
  analyze(input) {
    const expected = input.expectedNotes;
    if (!input.audio || !input.pitchMatch || expected.length === 0) {
      return { category: "dynamics", status: "not_ready", events: [] };
    }
    const findings = findDynamicFindings({
      notes: expected.map((note, i) => ({
        noteIndex: note.noteIndex,
        writtenDynamic: note.writtenDynamic,
        heardSec: heardAttackSec(input.pitchMatch, i),
      })),
      mono: input.audio.mono,
      sampleRateHz: input.audio.sampleRateHz,
    });
    if (!findings) {
      return { category: "dynamics", status: "not_ready", events: [] };
    }

    const byIndex = new Map<number, PieceExpectedNote>(
      expected.map((note) => [note.noteIndex, note]),
    );
    const events = findings.map((finding) => {
      const note = byIndex.get(finding.noteIndex);
      return createFeedbackEvent({
        eventId: `dynamics-${finding.noteIndex}-${finding.kind}`,
        category: "dynamics",
        kind: finding.kind,
        measure: note?.measure ?? null,
        beat: note?.beat ?? null,
        noteIndex: finding.noteIndex,
        onsetQuarters: note?.onsetQuarters ?? null,
        recordingTimeSec: input.pitchMatch?.timesSec[finding.noteIndex] ?? null,
        confidence: 0.7,
        importance: importanceFor(finding),
        explanation: dynamicExplanation(finding),
      });
    });
    return { category: "dynamics", status: "ready", events };
  },
};
