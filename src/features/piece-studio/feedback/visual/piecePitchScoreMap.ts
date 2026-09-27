import type { PiecePitchNoteV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import type { PieceScoreHighlight } from "@/features/piece-studio/score/OsmdScoreAdapter";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import {
  PRACTICE_CLEAR_MISS_CENTS,
  PRACTICE_IN_TUNE_CENTS,
} from "@/lib/intonationScore";

/**
 * Notehead ink after a take. Same colours as the Scale Studio key:
 * one green, one amber, one blue, one gray.
 */
export type PitchPaintKind =
  | "in_tune"
  | "sharp"
  | "sharp-strong"
  | "flat"
  | "flat-strong"
  | "missed";

export type PitchNoteMark = {
  id: string;
  kind: PitchPaintKind;
  /** Index into expected melody notes. Painting uses this before time matching. */
  noteIndex: number | null;
  startWholeNotes: number;
  endWholeNotes: number;
  label: string;
  source: "analysis" | "mock-preview";
};

/** Scale Studio key: green in tune, one amber when sharp, one blue when flat. */
export function pitchPaintKindFromCents(cents: number | null): PitchPaintKind {
  if (cents == null || !Number.isFinite(cents)) return "missed";
  const abs = Math.abs(cents);
  if (abs <= PRACTICE_IN_TUNE_CENTS) return "in_tune";
  if (cents > 0) {
    return abs <= PRACTICE_CLEAR_MISS_CENTS ? "sharp" : "sharp-strong";
  }
  return abs <= PRACTICE_CLEAR_MISS_CENTS ? "flat" : "flat-strong";
}

function pitchKind(issue: PieceCoachIssueView): PitchPaintKind | null {
  if (issue.category !== "pitch") return null;
  if (issue.kind === "sharp" || issue.kind === "flat" || issue.kind === "missed") {
    return issue.kind;
  }
  return null;
}

/** Every pitch issue → a notehead tint mark. No overlay plates or bar washes. */
export function pitchNoteMarksFromIssues(
  issues: readonly PieceCoachIssueView[],
): PitchNoteMark[] {
  const out: PitchNoteMark[] = [];
  for (const issue of issues) {
    const kind = pitchKind(issue);
    if (!kind) continue;
    out.push({
      id: issue.id,
      kind,
      noteIndex: issue.noteIndex,
      startWholeNotes: issue.startWholeNotes,
      endWholeNotes: issue.endWholeNotes,
      label: issue.where || issue.label || "Pitch",
      source: issue.source,
    });
  }
  return out;
}

/** Every expected note from a saved take, including the ones that were in tune. */
export function pitchMarksFromTake(
  notes: readonly PieceExpectedNote[],
  pitchNotes: readonly PiecePitchNoteV1[],
): PitchNoteMark[] {
  const byIndex = new Map(pitchNotes.map((note) => [note.noteIndex, note]));
  const out: PitchNoteMark[] = [];
  for (const note of notes) {
    const heard = byIndex.get(note.noteIndex);
    if (!heard) continue;
    const kind = pitchPaintKindFromCents(heard.cents);
    out.push({
      id: `pitch-note-${note.noteIndex}`,
      kind,
      noteIndex: note.noteIndex,
      startWholeNotes: note.absoluteOnsetQuarters / 4,
      endWholeNotes:
        (note.absoluteOnsetQuarters + note.durationQuarters) / 4,
      label: note.label,
      source: "analysis",
    });
  }
  return out;
}

/**
 * Pitch never uses score overlay highlights — colour lives on engraved heads
 * (Scale Studio style). Kept as a no-op so older call sites stay safe.
 */
export function pitchScoreHighlightsFromIssues(
  _issues: readonly PieceCoachIssueView[],
  _activeId: string | null,
): PieceScoreHighlight[] {
  return [];
}

export function pitchSummaryLine(issues: readonly PieceCoachIssueView[]): string {
  const pitch = issues.filter((i) => i.category === "pitch" && pitchKind(i));
  const n = pitch.length;
  if (n === 0) return "Pitch looks settled on this take.";
  if (n === 1) return "1 note sat outside pitch — colour on the score.";
  return `${n} notes sat outside pitch — colour on the score.`;
}
