import { describe, expect, it, vi } from "vitest";
import { buildScalePracticeSession } from "@/lib/buildScalePracticeSession";
import type { ScaleAnalysisResult } from "@/lib/analyzeScalePerformance";
import { SCALE_PRACTICE_SESSION_VERSION } from "@/lib/scalePracticeTypes";

function fakeAnalysis(expectedNoteCount: number): ScaleAnalysisResult {
  return {
    frames: [],
    notes: Array.from({ length: expectedNoteCount }, (_, i) => ({
      noteIndex: i,
      expectedMidi: 60 + i,
      expectedNoteLabel: `N${i}`,
      detectedMidi: 60 + i,
      detectedNoteLabel: `N${i}`,
      detectedHz: 440,
      centsDifference: 0,
      intonationBucket: "in_tune",
      missingData: false,
    })),
    summary: {
      overallScore0to100: 100,
      averageAbsCents: 0,
      inTunePercent: 100,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: expectedNoteCount,
      notesMissing: 0,
    },
  };
}

describe("buildScalePracticeSession", () => {
  it("builds a stable session shape and uses crypto.randomUUID when available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));

    const randomUUID = vi.fn(() => "uuid-123");
    const prevCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID },
      configurable: true,
    });

    const session = buildScalePracticeSession({
      tonicPitchClass: 0,
      scaleKind: "major",
      rootMidi: 60,
      octaveSpan: 1,
      audioSourceType: "uploaded",
      sampleRateHz: 48000,
      analysis: fakeAnalysis(8),
    });

    expect(session.schemaVersion).toBe(SCALE_PRACTICE_SESSION_VERSION);
    expect(session.exerciseType).toBe("scale_practice");
    expect(session.sessionId).toBe("uuid-123");
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(session.recordedAt).toBe("2026-01-02T03:04:05.000Z");
    // Exercise is up + down (top note appears once).
    expect(session.expectedNotesMidi.length).toBeGreaterThan(8);
    expect(session.notes).toHaveLength(8);

    Object.defineProperty(globalThis, "crypto", {
      value: prevCrypto,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it("falls back to a timestamp sessionId when crypto.randomUUID is unavailable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));

    const prevCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
    });

    const session = buildScalePracticeSession({
      tonicPitchClass: 9,
      scaleKind: "natural_minor",
      rootMidi: 57,
      octaveSpan: 2,
      audioSourceType: "recorded",
      sampleRateHz: 44100,
      analysis: fakeAnalysis(15),
    });

    expect(session.sessionId).toBe("scale-1767323045000");
    expect(session.recordedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(session.expectedNotesMidi.length).toBeGreaterThan(15);

    Object.defineProperty(globalThis, "crypto", {
      value: prevCrypto,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it("recorded and uploaded takes share the same scoring payload", () => {
    const analysis = fakeAnalysis(8);
    const shared = {
      tonicPitchClass: 0 as const,
      scaleKind: "major" as const,
      rootMidi: 60,
      octaveSpan: 1 as const,
      sampleRateHz: 48000,
      analysis,
    };
    const recorded = buildScalePracticeSession({
      ...shared,
      audioSourceType: "recorded",
    });
    const uploaded = buildScalePracticeSession({
      ...shared,
      audioSourceType: "uploaded",
    });
    expect(recorded.notes).toEqual(uploaded.notes);
    expect(recorded.summary).toEqual(uploaded.summary);
    expect(recorded.expectedNotesMidi).toEqual(uploaded.expectedNotesMidi);
    expect(recorded.audioSourceType).toBe("recorded");
    expect(uploaded.audioSourceType).toBe("uploaded");
  });

  it("stores a downsampled waveform with the attempt", () => {
    const session = buildScalePracticeSession({
      tonicPitchClass: 0,
      scaleKind: "major",
      rootMidi: 60,
      octaveSpan: 1,
      audioSourceType: "recorded",
      sampleRateHz: 48000,
      analysis: fakeAnalysis(8),
      waveformAmplitudes: Array.from({ length: 800 }, (_, i) =>
        i % 10 === 0 ? 0.95 : 0.08,
      ),
    });
    expect(session.waveformAmplitudes).toBeDefined();
    expect(session.waveformAmplitudes!.length).toBeLessThanOrEqual(240);
    expect(session.waveformAmplitudes!.length).toBeGreaterThan(0);
    expect(Math.max(...session.waveformAmplitudes!)).toBeGreaterThan(0.8);
  });
});

