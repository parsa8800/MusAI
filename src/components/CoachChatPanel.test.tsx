import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachChatPanel } from "@/components/CoachChatPanel";
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
      centsDifference: 0,
      intonationBucket: "in_tune",
      missingData: false,
    },
  ],
  summary: {
    overallScore0to100: 90,
    averageAbsCents: 8,
    inTunePercent: 100,
    weakestNoteIndices: [],
    trend: "balanced",
    meanSignedCents: 0,
    notesAnalyzed: 1,
    notesMissing: 0,
  },
};

describe("CoachChatPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows coach messages when started", async () => {
    render(
      <CoachChatPanel
        start
        embed
        trendLine="Trending sharp."
        tip="Work A4 next."
        source="template"
        session={session}
      />,
    );

    expect(screen.getByPlaceholderText(/Ask anything/i)).toBeInTheDocument();
    expect(screen.getByText(/Coach · Parsa/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preview coaching/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Template$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live AI is off/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/OPENAI_ENABLED/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByText(/Trending sharp/i)).toBeInTheDocument();
    expect(screen.getByText(/Work A4 next/i)).toBeInTheDocument();
  });

  it("shows Preview coaching tooltip on the status dot", async () => {
    render(
      <CoachChatPanel
        start
        embed
        trendLine="Steady take."
        tip="Keep the bow even."
        source="template"
        session={session}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Preview coaching/i }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Preview coaching");
  });

  it("hides the preview dot when live coaching is on", () => {
    render(
      <CoachChatPanel
        start
        embed
        trendLine="Steady take."
        tip="Keep the bow even."
        source="llm"
        session={session}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Preview coaching/i }),
    ).not.toBeInTheDocument();
  });
});
