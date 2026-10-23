import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import {
  dynamicGlyphsFromScore,
  type DynamicGlyph,
} from "@/features/piece-studio/score/writtenDynamics";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

export type DynamicLetterMark = {
  /** Order of the written dynamic on the page, starting at 0. */
  regionIndex: number;
  kind: "too_loud" | "too_soft" | "unchanged" | "reversed";
  issueId: string;
};

const LETTER_KINDS = new Set(["too_loud", "too_soft"]);
const HAIRPIN_KINDS = new Set(["unchanged", "reversed"]);

function letterGlyphs(notes: readonly PieceExpectedNote[]): DynamicGlyph[] {
  const glyphs: DynamicGlyph[] = [];
  let previous: string | null = null;
  for (const note of notes) {
    const mark = note.writtenDynamic;
    if (!mark || mark === previous) continue;
    glyphs.push({
      regionIndex: glyphs.length,
      type: "letter",
      mark,
      noteIndex: note.noteIndex,
    });
    previous = mark;
  }
  return glyphs;
}

function regionOfNote(
  notes: readonly PieceExpectedNote[],
  glyphs: readonly DynamicGlyph[],
): Map<number, number> {
  const letterAt = new Map<number, number>();
  for (const glyph of glyphs) {
    if (glyph.type === "letter") letterAt.set(glyph.noteIndex, glyph.regionIndex);
  }
  const out = new Map<number, number>();
  let region = -1;
  let previous: string | null = null;
  for (const note of notes) {
    const mark = note.writtenDynamic;
    if (mark && mark !== previous) {
      region = letterAt.get(note.noteIndex) ?? region;
      previous = mark;
    }
    if (region >= 0) out.set(note.noteIndex, region);
  }
  return out;
}

/**
 * Which written dynamics to colour.
 * Pitch stays on noteheads and rhythm stays a staff rectangle.
 * Pass the score when hairpins share the page with letters.
 */
export function dynamicLetterMarksFromIssues(
  notes: readonly PieceExpectedNote[],
  issues: readonly Pick<
    PieceCoachIssueView,
    "id" | "category" | "kind" | "noteIndex"
  >[],
  score?: MusaiScoreV1 | null,
): DynamicLetterMark[] {
  const glyphs = score ? dynamicGlyphsFromScore(score) : letterGlyphs(notes);
  const letters = regionOfNote(notes, glyphs);
  const out: DynamicLetterMark[] = [];
  const seen = new Set<number>();
  for (const issue of issues) {
    if (issue.category !== "dynamics") continue;
    if (typeof issue.noteIndex !== "number") continue;
    let regionIndex: number | undefined;
    if (LETTER_KINDS.has(issue.kind)) {
      regionIndex = letters.get(issue.noteIndex);
    } else if (HAIRPIN_KINDS.has(issue.kind)) {
      regionIndex = glyphs.find(
        (glyph) =>
          glyph.type === "hairpin" && glyph.noteIndex === issue.noteIndex,
      )?.regionIndex;
    }
    if (regionIndex == null || seen.has(regionIndex)) continue;
    seen.add(regionIndex);
    out.push({
      regionIndex,
      kind: issue.kind as DynamicLetterMark["kind"],
      issueId: issue.id,
    });
  }
  return out;
}

/** Two short tips for the teacher popup. No trailing full stop. */
export function dynamicHighlightExplanation(
  issue: Pick<PieceCoachIssueView, "where" | "what" | "practise">,
): { place: string | null; bullets: string[] } {
  const where = issue.where?.trim() ?? "";
  const place = /^Bar\s+\d+/i.test(where)
    ? where.replace(/\s*·\s*beat\s+.*/i, "").trim()
    : null;
  const bullets = [issue.what, issue.practise]
    .map((line) => line.trim().replace(/\.$/, ""))
    .filter(Boolean);
  return { place, bullets };
}
