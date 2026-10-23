import { describe, expect, it } from "vitest";
import {
  localPieceAskReply,
  localPieceCoachReply,
  pieceAskSuggestions,
  pieceCoachFollowPrompt,
  pieceCoachIdlePrompts,
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
    expect(reply).toMatch(/Bar 2/);
    expect(reply).toMatch(/Running slightly sharp/i);
    expect(reply).toMatch(/Getting ahead of the beat/i);
    expect(reply).not.toMatch(/[-—–]/);
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

  it("stays on the named bar of this take when the follow-up is about bar 7", () => {
    const piece: PieceAskContext = {
      title: "Beach Holiday",
      composer: null,
      keySignature: "G major",
      timeSignature: "4/4",
      tempoBpm: 96,
      measureCount: 12,
    };
    const bar7 = {
      ...pitch,
      id: "pitch-7",
      kind: "flat" as const,
      measure: "7",
      label: "Bar 7",
      where: "Bar 7",
      what: "Running slightly flat",
      practise: "Lift the finger a little",
    };
    const rhythm = {
      ...bar7,
      id: "rhythm-7",
      category: "rhythm" as const,
      kind: "late" as const,
      what: "Arrived a little late",
      practise: "Start it with the beat",
    };
    const dynamics = {
      ...bar7,
      id: "dynamics-7",
      category: "dynamics" as const,
      kind: "too_loud" as const,
      what: "This p was louder than the rest of your playing",
      practise: "Follow the marked p",
    };
    const issues = [pitch, bar7, rhythm, dynamics];
    const first = "What happened in bar 2?";
    const firstReply = localPieceAskReply(first, piece, pitch, issues);
    expect(firstReply.toLowerCase()).toContain("bar 2");
    expect(firstReply.toLowerCase()).toContain("sharp");

    const second = localPieceAskReply("what about bar 7", piece, pitch, issues, [
      { role: "user", text: first },
      { role: "assistant", text: firstReply },
    ]);
    expect(second.toLowerCase()).toContain("bar 7");
    expect(second.toLowerCase()).toContain("flat");
    expect(second.toLowerCase()).toContain("late");
    expect(second.toLowerCase()).toContain("louder");
    expect(second.toLowerCase()).not.toContain("bar 2");
    expect(second.toLowerCase()).not.toMatch(/g major|tempo|where to start/);
    expect(second).not.toMatch(/[—–]|\s-\s/);
    for (const line of second.split("\n")) {
      expect(line.trim().endsWith(".")).toBe(false);
    }

    const stay = localPieceAskReply("How do I practise this?", piece, pitch, issues, [
      { role: "user", text: first },
      { role: "assistant", text: firstReply },
      { role: "user", text: "what about bar 7" },
      { role: "assistant", text: second },
    ]);
    expect(stay.toLowerCase()).toContain("bar 7");
    expect(stay.toLowerCase()).not.toContain("bar 2");

    const clear = localPieceAskReply("what about bar 4", piece, pitch, issues);
    expect(clear).toBe(
      "• Bar 4 was fine\n• Keep it the way you played it",
    );

    expect(localPieceAskReply("What key is this?", piece, pitch, issues, [
      { role: "user", text: "what about bar 7" },
      { role: "assistant", text: second },
    ])).toMatch(/G major/);
  });

  it("offers two starters and one follow-up", () => {
    expect(pieceCoachIdlePrompts()).toEqual([
      "What key is this?",
      "Where should I start?",
    ]);
    expect(pieceCoachFollowPrompt(pitch)).toBe("How do I practise this?");
    expect(pieceCoachFollowPrompt(null)).toBe(
      "How should I practise the opening?",
    );
  });

  it("offers a few follow-up chips", () => {
    expect(pieceCoachSuggestedQuestions(pitch)).toEqual([
      "Why is Bar 2, beat 1 hard?",
      "How do I practise this?",
      "What should I work on next?",
    ]);
  });
});
