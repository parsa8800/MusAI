import { describe, expect, it } from "vitest";
import {
  buildScaleCoachChatContext,
  coachSuggestedQuestions,
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
      expectedNoteLabel: "C4",
      detectedMidi: 60,
      detectedNoteLabel: "C4",
      detectedHz: 261.6,
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
  it("builds measured note facts with string+finger labels", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• Work G3\n• Soften the thumb",
      "• Trending a bit high",
    );
    // C4 (midi 60) → G string 3rd finger (not G5 half-steps)
    expect(ctx.notes[0]).toMatchObject({
      label: "G3",
      pitchCue: "slightly_sharp",
      bucket: "sharp",
    });
    expect(ctx.weakNotes[0]).toBe("G3");
    expect(scaleCoachChatDataMessage(ctx)).toMatch(/MEASURED_TAKE_DATA/);
    expect(scaleCoachChatDataMessage(ctx)).toMatch(/staff colours/i);
    expect(scaleCoachChatSystemPrompt()).toMatch(/measured/i);
    expect(scaleCoachChatSystemPrompt()).toMatch(/only when they ask/i);
    expect(scaleCoachChatSystemPrompt()).toMatch(/progress bar/i);
    expect(scaleCoachChatSystemPrompt()).toMatch(/Do not quote percents/i);
  });

  it("answers small talk without dumping the tip", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• Work G3\n• Soften the thumb",
      "• Trending a bit high",
    );
    const reply = localCoachChatReply("how is your day today", ctx);
    expect(reply.toLowerCase()).toMatch(/good|help/);
    expect(reply).not.toMatch(/Work G3/);
  });

  it("answers thanks without dumping the tip", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• Work G3\n• Soften the thumb",
      "• Trending a bit high",
    );
    const reply = localCoachChatReply("okay great thanks for that!", ctx);
    expect(reply).toMatch(/welcome/i);
    expect(reply).not.toMatch(/^• Work G3$/m);
  });

  it("tells them a clean full take fills the bar", () => {
    const ctx = buildScaleCoachChatContext(session, "• Tip", "• Trend");
    const reply = localCoachChatReply("how do I fill the progress bar?", ctx);
    expect(reply).toMatch(/in tune|fills the bar/i);
    expect(reply).not.toMatch(/%/);
    expect(reply).not.toMatch(/G3/i);
    expect(reply).not.toMatch(/3 times/i);
  });

  it("answers string+finger questions with kid-friendly technique", () => {
    const ctx = buildScaleCoachChatContext(session, "• Tip", "• Trend");
    const reply = localCoachChatReply("how do I fix G3?", ctx);
    expect(reply).toMatch(/G3/i);
    expect(reply).toMatch(/high|tape|bow|slow/i);
    expect(reply).not.toMatch(/\d+\s*cents/i);
  });

  it("system prompt forbids cents and requires string+finger naming", () => {
    const prompt = scaleCoachChatSystemPrompt();
    expect(prompt).toMatch(/Never quote cents/i);
    expect(prompt).toMatch(/string \+ finger/i);
    expect(prompt).toMatch(/Fiddle Time|Viola Time/i);
    expect(prompt).toMatch(/too high/i);
    expect(prompt).toMatch(/cannot see/i);
    expect(prompt).toMatch(/coloured notes on the staff/i);
    expect(prompt).toMatch(/only when they ask/i);
  });

  it("suggests short questions from this take", () => {
    const ctx = buildScaleCoachChatContext(
      session,
      "• G3 was a bit high",
      "",
    );
    expect(coachSuggestedQuestions(ctx)).toEqual([
      "How do I fix G3?",
      "Why was it high?",
    ]);
    expect(coachSuggestedQuestions(ctx).join(" ")).not.toMatch(/3 times/i);

    const perfect: ScalePracticeSessionV1 = {
      ...session,
      notes: [
        {
          ...session.notes[0]!,
          centsDifference: 2,
          intonationBucket: "in_tune",
        },
      ],
      summary: {
        ...session.summary,
        overallScore0to100: 100,
        inTunePercent: 100,
        averageAbsCents: 2,
        meanSignedCents: 1,
        trend: "balanced",
        weakestNoteIndices: [0],
      },
    };
    const cleanCtx = buildScaleCoachChatContext(
      perfect,
      "• Every note was right on",
      "",
    );
    expect(cleanCtx.weakNotes).toEqual([]);
    expect(cleanCtx.greatStreak).toBe(1);
    expect(cleanCtx.greatTakesNeeded).toBe(3);
    expect(cleanCtx.barFull).toBe(true);
    expect(coachSuggestedQuestions(cleanCtx)).toEqual([
      "What should I try next?",
    ]);
  });
});
