import { describe, expect, it } from "vitest";
import {
  buildScaleCoachingLlmPayload,
  scaleCoachingSystemPrompt,
} from "@/lib/scaleCoachingLlm";
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
  expectedNotesMidi: [60, 62],
  audioSourceType: "uploaded",
  sampleRateHz: 48000,
  notes: [
    {
      noteIndex: 0,
      expectedMidi: 60,
      expectedNoteLabel: "C4",
      detectedMidi: 60,
      detectedNoteLabel: "C4",
      detectedHz: 261,
      centsDifference: 0,
      intonationBucket: "in_tune",
      missingData: false,
    },
    {
      noteIndex: 1,
      expectedMidi: 62,
      expectedNoteLabel: "D4",
      detectedMidi: 63,
      detectedNoteLabel: "D♯4",
      detectedHz: 277,
      centsDifference: 40,
      intonationBucket: "sharp",
      missingData: false,
    },
  ],
  summary: {
    overallScore0to100: 90,
    averageAbsCents: 20,
    inTunePercent: 50,
    weakestNoteIndices: [1],
    trend: "sharp",
    meanSignedCents: 20,
    notesAnalyzed: 2,
    notesMissing: 0,
  },
};

describe("scaleCoachingLlm", () => {
  it("builds a compact measured payload with string+finger labels", () => {
    const payload = buildScaleCoachingLlmPayload(session);
    expect(payload.scaleLabel).toBe("C major");
    expect(payload.score).toBe(90);
    // D4 (midi 62) → open D string
    expect(payload.weakNotes[0]?.label).toBe("D0");
    expect(payload.templateTip).toMatch(/D0/i);
    expect(payload.templateTip).toMatch(/a bit high/i);
    expect(payload.templateTip.split("\n")).toHaveLength(1);
    expect(payload.templateTrend).toBe("");
  });

  it("system prompt uses reserved opener rules and string+finger naming", () => {
    const prompt = scaleCoachingSystemPrompt();
    expect(prompt).toMatch(/JSON only/i);
    expect(prompt).toMatch(/1 bullet normally/i);
    expect(prompt).toMatch(/2 bullets only for a major pattern/i);
    expect(prompt).not.toMatch(/Strong \/ Work on cards/i);
    expect(prompt).toMatch(/Never use hyphens/i);
    expect(prompt).toMatch(/string \+ finger/i);
    expect(prompt).toMatch(/a bit high/i);
    expect(prompt).toMatch(/Do not add a Try line/i);
    expect(prompt).toMatch(/CLEAN TAKE/i);
    expect(prompt).toMatch(/cannot see/i);
    expect(prompt).toMatch(/coloured notes/i);
  });
});
