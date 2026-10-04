import { describe, expect, it } from "vitest";
import { mockPieceFeedbackIssues } from "@/features/piece-studio/feedback/visual/mockPieceFeedbackPreview";
import {
  coachIssuesFromEvents,
  coachIssuesFromMock,
  collapsePieceCoachIssues,
  pieceCoachCollapseKey,
} from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";
import { coachFocusItemFromEvent } from "@/features/piece-studio/feedback/pieceCoachContext";
import { createFeedbackEvent } from "@/features/piece-studio/feedback/createFeedbackEvent";
import { pieceFeedbackVisualStyle } from "@/features/piece-studio/feedback/visual/pieceFeedbackAnnotation";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("collapsePieceCoachIssues", () => {
  const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
  const issues = coachIssuesFromMock(mockPieceFeedbackIssues(score));
  const tempo = issues.find((issue) => issue.category === "tempo")!;

  it("does not merge pitch notes in the same bar", () => {
    const pitch = issues.find((issue) => issue.category === "pitch")!;
    const collapsed = collapsePieceCoachIssues([
      { ...pitch, id: "a", startWholeNotes: 0, endWholeNotes: 0.25 },
      { ...pitch, id: "b", startWholeNotes: 0.25, endWholeNotes: 0.5 },
    ]);
    expect(collapsed).toHaveLength(2);
    expect(pieceCoachCollapseKey(collapsed[0]!)).not.toBe(
      pieceCoachCollapseKey(collapsed[1]!),
    );
  });

  it("merges passage-level tempo clones in the same bar", () => {
    const collapsed = collapsePieceCoachIssues([
      { ...tempo, id: "a", startWholeNotes: 1, endWholeNotes: 1.5 },
      { ...tempo, id: "b", startWholeNotes: 1.25, endWholeNotes: 2 },
      { ...tempo, id: "c", measure: "4", where: "Bar 4", startWholeNotes: 4 },
    ]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0]!.id).toBe("a");
    expect(collapsed[0]!.startWholeNotes).toBe(1);
    expect(collapsed[0]!.endWholeNotes).toBe(2);
  });
});

describe("coachIssuesFromEvents", () => {
  it("maps live pitch events onto individual note spans", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const notes = expectedNotesFromScore(score);
    const note = notes.find(
      (item) => item.absoluteOnsetQuarters !== item.onsetQuarters,
    )!;
    const event = createFeedbackEvent({
      eventId: "pitch-2-sharp",
      category: "pitch",
      kind: "sharp",
      measure: note.measure,
      beat: note.beat,
      noteIndex: note.noteIndex,
      onsetQuarters: note.onsetQuarters,
      recordingTimeSec: 0.8,
      confidence: 0.7,
      importance: 0.72,
      explanation: `Bar ${note.measure} ran a little high.`,
    });
    const [issue] = coachIssuesFromEvents([event], notes);
    expect(issue?.visualStyle).toBe("note");
    expect(issue?.startWholeNotes).toBeCloseTo(note.absoluteOnsetQuarters / 4);
    expect(issue?.endWholeNotes).toBeCloseTo(
      (note.absoluteOnsetQuarters +
        Math.max(0.5, note.durationQuarters)) /
        4,
    );
    expect(pieceFeedbackVisualStyle("tempo")).toBe("measure");
    expect(coachFocusItemFromEvent(event).category).toBe("pitch");
  });
});
