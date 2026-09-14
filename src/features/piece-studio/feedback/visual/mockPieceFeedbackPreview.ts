/**
 * MOCK VISUAL PREVIEW ONLY.
 *
 * This is not an analyzer and must not be imported from
 * `practice/analyzePieceTake`, skill analyzers, or `buildPieceCoachContext`.
 * Real analysis stays in `feedback/analyzers/*Analyzer.ts`.
 *
 * Used to explore progressive score feedback (one focus at a time) with
 * clearly labeled sample data — never presented as a real take.
 */

import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import type {
  PieceFeedbackCategory,
  PieceFeedbackKind,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

export const MOCK_PIECE_FEEDBACK_SOURCE = "mock-preview" as const;

/** How the prototype paints this issue on the score (no text labels on the page). */
export type MockPieceVisualStyle = "note" | "measure" | "heat";

/** Student-facing prototype categories for exploration. */
export type MockPieceVisualTone =
  | "pitch"
  | "rhythm"
  | "rushing"
  | "dragging"
  | "dynamics";

export type MockPieceFeedbackIssue = {
  mock: true;
  source: typeof MOCK_PIECE_FEEDBACK_SOURCE;
  id: string;
  category: PieceFeedbackCategory;
  kind: PieceFeedbackKind;
  /** Chip / aria short name — not drawn on the score. */
  label: string;
  visualTone: MockPieceVisualTone;
  visualStyle: MockPieceVisualStyle;
  measure: string;
  beat: number | null;
  startWholeNotes: number;
  endWholeNotes: number;
  improveFirst: string;
  where: string;
  what: string;
  practise: string;
  coach: string;
};

type MeasureSpan = {
  number: string;
  startQ: number;
  endQ: number;
};

function measureLengthQuarters(
  beats: number,
  beatType: number,
  maxEventEnd: number,
): number {
  return Math.max(beats * (4 / Math.max(1, beatType)), maxEventEnd, 0);
}

function measureSpans(score: MusaiScoreV1): MeasureSpan[] {
  const part = score.parts[0];
  if (!part) return [];
  let beats = 4;
  let beatType = 4;
  let quarter = 0;
  const out: MeasureSpan[] = [];
  for (const measure of part.measures) {
    if (measure.time) {
      beats = measure.time.beats;
      beatType = measure.time.beatType;
    }
    let maxEnd = 0;
    for (const event of measure.events) {
      if (event.kind === "note" || event.kind === "rest") {
        maxEnd = Math.max(maxEnd, event.onsetQuarters + event.durationQuarters);
      }
    }
    const len = measureLengthQuarters(beats, beatType, maxEnd);
    out.push({ number: measure.number, startQ: quarter, endQ: quarter + len });
    quarter += len;
  }
  return out;
}

function whole(q: number): number {
  return q / 4;
}

function bar(measure: string): string {
  return `Bar ${measure}`;
}

function issue(
  partial: Omit<MockPieceFeedbackIssue, "mock" | "source">,
): MockPieceFeedbackIssue {
  return {
    mock: true,
    source: MOCK_PIECE_FEEDBACK_SOURCE,
    ...partial,
  };
}

/**
 * Sample issues placed on the real score so overlays can be tried.
 * Importance order: pitch → rhythm → rushing → dragging → dynamics.
 * Only one should be focused in the UI at a time.
 */
export function mockPieceFeedbackIssues(
  score: MusaiScoreV1 | null | undefined,
): MockPieceFeedbackIssue[] {
  if (!score) return [];
  const spans = measureSpans(score);
  if (spans.length === 0) return [];
  const notes = expectedNotesFromScore(score);
  const first = spans[0]!;
  const mid = spans[Math.min(1, spans.length - 1)]!;
  const last = spans[spans.length - 1]!;
  const pitchNote = notes[2] ?? notes[0] ?? null;
  const rhythmNote = notes[4] ?? notes[1] ?? notes[0] ?? null;
  const out: MockPieceFeedbackIssue[] = [];

  if (pitchNote) {
    const span = spans.find((s) => s.number === pitchNote.measure) ?? first;
    const startQ = span.startQ + pitchNote.onsetQuarters;
    const endQ = startQ + Math.max(pitchNote.durationQuarters, 0.5);
    out.push(
      issue({
        id: "mock-pitch",
        category: "pitch",
        kind: "sharp",
        label: "Pitch",
        visualTone: "pitch",
        visualStyle: "note",
        measure: pitchNote.measure,
        beat: pitchNote.beat,
        startWholeNotes: whole(startQ),
        endWholeNotes: whole(endQ),
        improveFirst: "Pitch",
        where: `${bar(pitchNote.measure)}, beat ${pitchNote.beat}`,
        what: "A few notes are running sharp",
        practise: "Play the phrase slowly and relax into each note",
        coach:
          "The first thing to settle is pitch. Stay on that note until it sits, then join the notes on either side.",
      }),
    );
  }

  if (rhythmNote) {
    const span = spans.find((s) => s.number === rhythmNote.measure) ?? mid;
    const startQ = span.startQ + rhythmNote.onsetQuarters;
    const endQ = startQ + Math.max(rhythmNote.durationQuarters, 0.5);
    out.push(
      issue({
        id: "mock-rhythm",
        category: "rhythm",
        kind: "late",
        label: "Rhythm",
        visualTone: "rhythm",
        visualStyle: "note",
        measure: rhythmNote.measure,
        beat: rhythmNote.beat,
        startWholeNotes: whole(startQ),
        endWholeNotes: whole(endQ),
        improveFirst: "Rhythm",
        where: `${bar(rhythmNote.measure)}, beat ${rhythmNote.beat}`,
        what: "A note arrived after the beat",
        practise: "Tap the beat, then play just this bar",
        coach:
          "Keep a steady beat in your foot. Come in with the beat instead of after it.",
      }),
    );
  }

  out.push(
    issue({
      id: "mock-rushing",
      category: "tempo",
      kind: "rushing",
      label: "Rushing",
      visualTone: "rushing",
      visualStyle: "heat",
      measure: first.number,
      beat: 1,
      startWholeNotes: whole(first.startQ),
      endWholeNotes: whole(first.endQ),
      improveFirst: "Tempo",
      where: bar(first.number),
      what: "This stretch is rushing ahead of the beat",
      practise: "Play under tempo, then bring it back up",
      coach:
        "The start of the piece leaned forward. Think of each beat landing, not hurrying to the next bar.",
    }),
  );

  const dragSpan = mid.number === first.number ? last : mid;
  out.push(
    issue({
      id: "mock-dragging",
      category: "tempo",
      kind: "slowing",
      label: "Dragging",
      visualTone: "dragging",
      visualStyle: "heat",
      measure: dragSpan.number,
      beat: 1,
      startWholeNotes: whole(dragSpan.startQ),
      endWholeNotes: whole(dragSpan.endQ),
      improveFirst: "Tempo",
      where: bar(dragSpan.number),
      what: "This stretch is dragging behind the beat",
      practise: "Count out loud through these bars",
      coach:
        "This stretch sat behind the beat. Count through the notes so they don’t lean back.",
    }),
  );

  out.push(
    issue({
      id: "mock-dynamics",
      category: "dynamics",
      kind: "too_loud",
      label: "Dynamics",
      visualTone: "dynamics",
      visualStyle: "measure",
      measure: last.number,
      beat: 1,
      startWholeNotes: whole(last.startQ),
      endWholeNotes: whole(last.endQ),
      improveFirst: "Dynamics",
      where: bar(last.number),
      what: "This part is louder than the score asks",
      practise: "Play once quietly, then as written",
      coach:
        "Watch the dynamic mark on this staff. Try the bar once under the written volume, then once as written.",
    }),
  );

  return out;
}

export function mockIssueById(
  issues: readonly MockPieceFeedbackIssue[],
  id: string | null,
): MockPieceFeedbackIssue | null {
  if (!id) return issues[0] ?? null;
  return issues.find((issue) => issue.id === id) ?? issues[0] ?? null;
}
