import { describe, expect, it } from "vitest";
import {
  buildScaleCoachChatContext,
  localCoachChatReply,
  scaleCoachChatDataMessage,
  scaleCoachChatSystemPrompt,
} from "@/lib/scaleCoachChat";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

const session: ScalePracticeSessionV1 = {
  schemaVersion: 1,
  sessionId: "s1",
  exerciseType: "scale_practice",
  recordedAt: "2026-01-01T00:00:00.000Z",
  scaleId: "C_major",
  scaleLabel: "C major",
  scaleKind: "major",
  tonicPitchClass: 0,
  octaveSpan: 1,
  octaveRangeLabel: "C4 → C5",
  rootMidi: 60,
  expectedNotesMidi: [60],
  audioSourceType: "uploaded",
  sampleRateHz: 48000,
  notes: [
    {
      noteIndex: 0,
      expectedMidi: 60,
      expectedNoteLabel: "A4",
      detectedMidi: 60,
      detectedNoteLabel: "A4",
      detectedHz: 440,
      centsDifference: 30,
      intonationBucket: "sharp",
      missingData: false,
    },
  ],
  summary: {
    overallScore0to100: 70,
    averageAbsCents: 30,
    inTunePercent: 40,
    weakestNoteIndices: [0],
    trend: "sharp",
    meanSignedCents: 30,
    notesAnalyzed: 1,
    notesMissing: 0,
  },
};

describe("scaleCoachChat", () => {
  it("builds measured note facts for the LLM", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• Work A4\n• Lighten the finger",
      "• Trending a bit sharp",
    );
    expect(ctx.notes[0]).toMatchObject({
      label: "A4",
      pitchCue: "slightly_sharp",
      bucket: "sharp",
    });
    expect(scaleCoachChatDataMessage(ctx)).toMatch(/MEASURED_TAKE_DATA/);
    expect(scaleCoachChatSystemPrompt()).toMatch(/measured/i);
  });

  it("answers small talk without dumping the tip", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• Work A4\n• Lighten the finger",
      "• Trending a bit sharp",
    );
    const reply = localCoachChatReply("how is your day today", ctx);
    expect(reply.toLowerCase()).toMatch(/good|thanks|ready/);
    expect(reply).not.toMatch(/Work A4/);
  });

  it("answers thanks without dumping the tip", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• Work A4\n• Lighten the finger",
      "• Trending a bit sharp",
    );
    const reply = localCoachChatReply("okay great thanks for that!", ctx);
    expect(reply).toMatch(/welcome/i);
    expect(reply).not.toMatch(/^• Work A4$/m);
  });

  it("answers note questions with technique, not cents", () => {
    const ctx = buildScaleCoachChatContext(session, "• Tip", "• Trend");
    const reply = localCoachChatReply("how do I fix A4?", ctx);
    expect(reply).toMatch(/A4/i);
    expect(reply).toMatch(/thumb|bow|soft|settle|high|sharp/i);
    expect(reply).not.toMatch(/\d+\s*cents/i);
  });

  it("system prompt forbids quoting cents to the student", () => {
    expect(scaleCoachChatSystemPrompt()).toMatch(/Never quote cents/i);
    expect(scaleCoachChatSystemPrompt()).toMatch(/bow hair|thumb/i);
  });
});
