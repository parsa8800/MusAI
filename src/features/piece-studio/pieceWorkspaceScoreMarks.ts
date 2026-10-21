import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { pitchMarksFromTake } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import { dynamicLetterMarksFromIssues } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";
import { rhythmHighlightsFromIssues } from "@/features/piece-studio/feedback/visual/pieceRhythmScoreMap";
import type { PiecePitchNoteV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { PieceScoreHighlight } from "@/features/piece-studio/score/OsmdScoreAdapter";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

/** Pitch colours on engraved noteheads for a practise take. */
export function piecePitchMarks(input: {
  view: "score" | "practise";
  hasLivePitch: boolean;
  structured: MusaiScoreV1 | null | undefined;
  pitchColoursOn: boolean;
  livePitchNotes: readonly PiecePitchNoteV1[] | null;
}) {
  if (
    input.view !== "practise" ||
    !input.hasLivePitch ||
    !input.structured ||
    !input.pitchColoursOn
  ) {
    return [];
  }
  return pitchMarksFromTake(
    expectedNotesFromScore(input.structured),
    input.livePitchNotes ?? [],
  );
}

/** Wrong written dynamics stay pressable on the score. */
export function pieceDynamicMarks(input: {
  view: "score" | "practise";
  structured: MusaiScoreV1 | null | undefined;
  coachIssues: readonly PieceCoachIssueView[];
}) {
  if (input.view !== "practise" || !input.structured) return [];
  return dynamicLetterMarksFromIssues(
    expectedNotesFromScore(input.structured),
    input.coachIssues,
    input.structured,
  );
}

/**
 * Pitch stays on noteheads. Every rhythm miss gets a staff rectangle.
 * Tempo / other skills may add a focused wash.
 */
export function pieceScoreHighlights(input: {
  showPreview: boolean;
  coachIssues: readonly PieceCoachIssueView[];
  previewIssue: PieceCoachIssueView | null;
  focusedHighlight: PieceScoreHighlight | null;
}): PieceScoreHighlight[] {
  if (!input.showPreview) return [];
  const rhythm = rhythmHighlightsFromIssues(
    input.coachIssues,
    input.previewIssue?.category === "rhythm" ? input.previewIssue.id : null,
  );
  return input.focusedHighlight
    ? [input.focusedHighlight, ...rhythm]
    : rhythm;
}

export function pieceFocusedHighlight(input: {
  showPreview: boolean;
  previewIssue: PieceCoachIssueView | null;
}): PieceScoreHighlight | null {
  if (!input.showPreview || !input.previewIssue) return null;
  // Pitch colours noteheads. Rhythm uses a staff rectangle. Dynamics
  // colours the written letters. None of those use this focused wash.
  if (
    input.previewIssue.category === "pitch" ||
    input.previewIssue.category === "rhythm" ||
    input.previewIssue.category === "dynamics" ||
    input.previewIssue.category === "tempo"
  ) {
    return null;
  }
  return {
    id: input.previewIssue.id,
    startWholeNotes: input.previewIssue.startWholeNotes,
    endWholeNotes: input.previewIssue.endWholeNotes,
    label: input.previewIssue.where,
    source: input.previewIssue.source,
    visualTone: input.previewIssue.visualTone,
    visualStyle: input.previewIssue.visualStyle,
    emphasis: "focus",
  };
}
