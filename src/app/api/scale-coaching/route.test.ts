import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
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
      detectedHz: 261,
      centsDifference: 0,
      intonationBucket: "in_tune",
      missingData: false,
    },
  ],
  summary: {
    overallScore0to100: 95,
    averageAbsCents: 4,
    inTunePercent: 100,
    weakestNoteIndices: [],
    trend: "balanced",
    meanSignedCents: 0,
    notesAnalyzed: 1,
    notesMissing: 0,
  },
};

describe("POST /api/scale-coaching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns the short template opener and never calls OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_ENABLED", "true");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/scale-coaching/route");
    const res = await POST(
      new Request("http://localhost/api/scale-coaching", {
        method: "POST",
        body: JSON.stringify({ session }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      tip: string;
      trendLine: string;
      source: string;
    };
    expect(json.source).toBe("template");
    expect(json.tip.length).toBeGreaterThan(0);
    expect(json.tip.split("\n")).toHaveLength(1);
    expect(json.trendLine).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("still returns template when no API key is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("@/app/api/scale-coaching/route");
    const res = await POST(
      new Request("http://localhost/api/scale-coaching", {
        method: "POST",
        body: JSON.stringify({ session }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { source: string; tip: string };
    expect(json.source).toBe("template");
    expect(json.tip.length).toBeGreaterThan(0);
  });

  it("rejects invalid bodies", async () => {
    const { POST } = await import("@/app/api/scale-coaching/route");
    const res = await POST(
      new Request("http://localhost/api/scale-coaching", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});
