import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";

export type DynamicLetterMark = {
  /** Order of the written dynamic on the page, starting at 0. */
  regionIndex: number;
  kind: "too_loud" | "too_soft";
};

/**
 * Which written dynamic letters to colour.
 * Pitch stays on noteheads and rhythm stays a staff rectangle.
 */
export function dynamicLetterMarksFromIssues(
  notes: readonly PieceExpectedNote[],
  issues: readonly Pick<PieceCoachIssueView, "category" | "kind" | "noteIndex">[],
): DynamicLetterMark[] {
  const regionOfNote = new Map<number, number>();
  let region = -1;
  let previous: string | null = null;
  for (const note of notes) {
    const mark = note.writtenDynamic;
    if (mark && mark !== previous) {
      region += 1;
      previous = mark;
    }
    if (region >= 0) regionOfNote.set(note.noteIndex, region);
  }

  const out: DynamicLetterMark[] = [];
  const seen = new Set<number>();
  for (const issue of issues) {
    if (issue.category !== "dynamics") continue;
    if (issue.kind !== "too_loud" && issue.kind !== "too_soft") continue;
    if (typeof issue.noteIndex !== "number") continue;
    const regionIndex = regionOfNote.get(issue.noteIndex);
    if (regionIndex == null || seen.has(regionIndex)) continue;
    seen.add(regionIndex);
    out.push({ regionIndex, kind: issue.kind });
  }
  return out;
}
