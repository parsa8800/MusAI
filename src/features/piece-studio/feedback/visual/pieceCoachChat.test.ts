import { describe, expect, it } from "vitest";
import {
  localPieceAskReply,
  localPieceCoachReply,
  pieceAskSuggestions,
  pieceCoachOpenerText,
  pieceCoachSuggestedQuestions,
  prioritizePieceCoachIssues,
  type PieceAskContext,
} from "@/features/piece-studio/feedback/visual/pieceCoachChat";
import type { PieceCoachIssueView } from "@/features/piece-studio/feedback/visual/pieceCoachIssueView";

const pitch: PieceCoachIssueView = {
  id: "pitch-0",
  source: "analysis",
  category: "pitch",
  kind: "sharp",
  severity: "focus",
  label: "Bar 2",
  visualTone: "pitch",
  visualStyle: "measure",
  measure: "2",
  beat: 1,
  noteIndex: null,
  startWholeNotes: 1,
  endWholeNotes: 2,
  improveFirst: "Settle the high notes",
  where: "Bar 2, beat 1",
  what: "Running slightly sharp",
  practise: "Play the phrase slowly and relax into each note",
  coach: "Keep the finger soft and check the string.",
};

const tempo: PieceCoachIssueView = {
  ...pitch,
  id: "tempo-0",
  category: "tempo",
  kind: "rushing",
  visualTone: "rushing",
  improveFirst: "Keep the tempo steady",
  where: "First phrase",
  what: "Getting ahead of the beat",
  practise: "Play under tempo, then bring it back up.",
  coach: "Land each beat.",
};

describe("pieceCoachChat", () => {
  it("keeps chat quiet until the student asks", () => {
    expect(pieceCoachOpenerText([tempo, pitch])).toBe("");
  });

  it("orders pitch ahead of tempo", () => {
    expect(prioritizePieceCoachIssues([tempo, pitch]).map((i) => i.id)).toEqual([
      "pitch-0",
      "tempo-0",
    ]);
  });

  it("answers where / practise / why from the focused issue", () => {
    expect(localPieceCoachReply("Where should I look?", pitch)).toContain(
      "Bar 2, beat 1",
    );
    expect(localPieceCoachReply("How do I practise this?", pitch)).toContain(
      "slowly",
    );
    expect(localPieceCoachReply("Why did that happen?", pitch)).toContain(
      "sharp",
    );
  });

  it("lists a priority order when asked what next", () => {
    const reply = localPieceCoachReply("What next?", pitch, [tempo, pitch]);
    expect(reply).toMatch(/First: Running slightly sharp/i);
    expect(reply).toMatch(/Then: Getting ahead of the beat/i);
  });

  it("answers questions about the written piece without a take", () => {
    const piece: PieceAskContext = {
      title: "Violin Concerto in E minor (excerpt)",
      composer: "Mendelssohn",
      keySignature: "E minor",
      timeSignature: "2/2",
      tempoBpm: 120,
      measureCount: 16,
    };
    expect(pieceAskSuggestions(piece)).toEqual([
      "What key is this?",
      "What time is this?",
      "How fast is it?",
      "Where should I start?",
      "How many bars is it?",
      "Who wrote this?",
      "How should I practise the opening?",
    ]);
    expect(localPieceAskReply("What key is this?", piece)).toMatch(/E minor/i);
    expect(localPieceAskReply("How fast is it?", piece)).toMatch(/120/);
    expect(localPieceAskReply("Where should I start?", piece)).toMatch(/slowly/i);
    expect(localPieceAskReply("Was I in tune?", piece)).toMatch(/record a take/i);
  });

  it("offers a few follow-up chips", () => {
    expect(pieceCoachSuggestedQuestions(pitch)).toEqual([
      "Why is Bar 2, beat 1 hard?",
      "How do I practise this?",
      "What should I work on next?",
    ]);
  });
});
