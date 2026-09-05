import { beforeEach, describe, expect, it, vi } from "vitest";
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
      expectedNoteLabel: "A4",
      detectedMidi: 63,
      detectedNoteLabel: "A4",
      detectedHz: 440,
      centsDifference: 40,
      intonationBucket: "sharp",
      missingData: false,
    },
  ],
  summary: {
    overallScore0to100: 80,
    averageAbsCents: 20,
    inTunePercent: 50,
    weakestNoteIndices: [1],
    trend: "sharp",
    meanSignedCents: 20,
    notesAnalyzed: 2,
    notesMissing: 0,
  },
};

describe("POST /api/scale-coach-chat", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns a conversational template reply for thanks", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("@/app/api/scale-coach-chat/route");
    const res = await POST(
      new Request("http://localhost/api/scale-coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          tip: "• Work A4\n• Lighten the finger",
          trendLine: "• Trending a bit sharp",
          messages: [
            { role: "assistant", text: "• Trending a bit sharp" },
            { role: "user", text: "okay great thanks for that!" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reply: string; source: string };
    expect(data.source).toBe("template");
    expect(data.reply).toMatch(/welcome/i);
    expect(data.reply).not.toMatch(/Ask about a specific note for a tighter drill/i);
    expect(data.reply.split("\n").every((l) => l.startsWith("• "))).toBe(true);
  });
});
