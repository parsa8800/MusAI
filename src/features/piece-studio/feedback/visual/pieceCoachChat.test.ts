import { describe, expect, it } from "vitest";
import {
  localPieceCoachReply,
  pieceCoachOpenerText,
  pieceCoachSuggestedQuestions,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

const issue: PieceCoachIssueView = {
  id: "pitch-0",
  source: "analysis",
  category: "pitch",
  kind: "sharp",
  severity: "focus",
  label: "Bar 2",
  visualTone: "pitch",
  visualStyle: "note",
  measure: "2",
  beat: 1,
  startWholeNotes: 1,
  endWholeNotes: 1.25,
  improveFirst: "Pitch",
  where: "Bar 2, beat 1",
  what: "A few notes are running sharp",
  practise: "Play the phrase slowly and relax into each note",
  coach: "Keep the finger soft and check the string.",
};

describe("pieceCoachChat", () => {
  it("keeps the opener empty so the focus card leads", () => {
    expect(pieceCoachOpenerText(issue)).toBe("");
  });

  it("answers where / practise / why from the focused issue", () => {
    expect(localPieceCoachReply("Where should I look?", issue)).toContain(
      "Bar 2, beat 1",
    );
    expect(localPieceCoachReply("How do I practise this?", issue)).toContain(
      "slowly",
    );
    expect(localPieceCoachReply("Why did that happen?", issue)).toContain(
      "sharp",
    );
  });

  it("offers a few follow-up chips", () => {
    expect(pieceCoachSuggestedQuestions(issue)).toEqual([
      "Where on the score?",
      "How do I practise?",
      "Why?",
    ]);
  });
});
