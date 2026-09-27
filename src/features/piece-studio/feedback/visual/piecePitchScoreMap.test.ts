import { describe, expect, it } from "vitest";
import {
  pitchMarksFromTake,
  pitchNoteMarksFromIssues,
  pitchScoreHighlightsFromIssues,
  pitchSummaryLine,
} from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

function pitchIssue(
  partial: Partial<PieceCoachIssueView> & Pick<PieceCoachIssueView, "id" | "kind" | "measure">,
): PieceCoachIssueView {
  return {
    source: "mock-preview",
    category: "pitch",
    severity: null,
    label: "Pitch",
    visualTone: "pitch",
    visualStyle: "note",
    beat: 1,
    noteIndex: 0,
    startWholeNotes: 0,
    endWholeNotes: 0.25,
    improveFirst: "Pitch",
    where: `Bar ${partial.measure}`,
    what: "Running slightly sharp",
    practise: "Relax the left hand",
    coach: "",
    ...partial,
  };
}

describe("piecePitchScoreMap", () => {
  it("maps pitch kinds onto note marks", () => {
    const marks = pitchNoteMarksFromIssues([
      pitchIssue({ id: "a", kind: "sharp", measure: "1" }),
      pitchIssue({ id: "b", kind: "flat", measure: "1", startWholeNotes: 0.25, endWholeNotes: 0.5 }),
      {
        ...pitchIssue({ id: "c", kind: "sharp", measure: "2" }),
        category: "tempo",
        kind: "rushing",
        visualTone: "rushing",
        visualStyle: "measure",
      },
    ]);
    expect(marks).toHaveLength(2);
    expect(marks.map((m) => m.kind)).toEqual(["sharp", "flat"]);
  });

  it("never emits overlay washes — pitch is notehead colour only", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      pitchIssue({
        id: `n${i}`,
        kind: i % 2 === 0 ? "sharp" : "flat",
        measure: "1",
        startWholeNotes: i * 0.25,
        endWholeNotes: i * 0.25 + 0.25,
      }),
    );
    expect(pitchScoreHighlightsFromIssues(many, "n1")).toEqual([]);
  });

  it("colours every note from a take, including ones that were in tune", () => {
    const notes = [
      {
        midi: 72,
        label: "C5",
        onsetQuarters: 0,
        absoluteOnsetQuarters: 0,
        durationQuarters: 1,
        measure: "1",
        beat: 1,
        noteIndex: 0,
        writtenDynamic: null,
      },
      {
        midi: 74,
        label: "D5",
        onsetQuarters: 1,
        absoluteOnsetQuarters: 1,
        durationQuarters: 1,
        measure: "1",
        beat: 2,
        noteIndex: 1,
        writtenDynamic: null,
      },
    ];
    const marks = pitchMarksFromTake(notes, [
      { noteIndex: 0, cents: 4 },
      { noteIndex: 1, cents: null },
    ]);
    expect(marks.map((mark) => mark.kind)).toEqual(["in_tune", "missed"]);
    expect(marks.map((mark) => mark.noteIndex)).toEqual([0, 1]);
  });

  it("summarises pitch without Heard/Try wording", () => {
    expect(pitchSummaryLine([])).toMatch(/settled/i);
    expect(
      pitchSummaryLine([pitchIssue({ id: "a", kind: "sharp", measure: "1" })]),
    ).toMatch(/1 note/);
    expect(
      pitchSummaryLine([
        pitchIssue({ id: "a", kind: "sharp", measure: "1" }),
        pitchIssue({ id: "b", kind: "flat", measure: "1" }),
      ]),
    ).toMatch(/colour on the score/i);
  });
});
