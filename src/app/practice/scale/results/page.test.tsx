import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const readScalePracticeSessionMock = vi.fn();
vi.mock("@/lib/scalePracticeSession", () => ({
  readScalePracticeSession: () => readScalePracticeSessionMock(),
  readScalePracticeHistoryEntry: () => null,
  persistScalePracticeSession: vi.fn(),
  clearScalePracticeSession: vi.fn(),
  formatScaleTakeSubtitle: () => "Detected · 1 octave",
}));

vi.mock("@/components/ScalePracticeResultsView", () => ({
  ScalePracticeResultsView: ({
    session,
  }: {
    session: { scaleLabel: string; summary: { overallScore0to100: number } };
  }) => (
    <div>
      <h1>{session.scaleLabel}</h1>
      <p>{session.summary.overallScore0to100}</p>
    </div>
  ),
}));

import ScalePracticeResultsPage from "@/app/practice/scale/results/page";

describe("ScalePracticeResultsPage", () => {
  it("renders a hydration-safe loading shell first", () => {
    readScalePracticeSessionMock.mockReturnValue(null);
    render(<ScalePracticeResultsPage />);
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it("shows the empty state when there is no stored session", async () => {
    readScalePracticeSessionMock.mockReturnValue(null);
    render(<ScalePracticeResultsPage />);
    expect(await screen.findByText(/No take yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scale studio/i })).toHaveAttribute(
      "href",
      "/practice/scale",
    );
  });

  it("shows the results view when a session exists", async () => {
    readScalePracticeSessionMock.mockReturnValue({
      schemaVersion: 1,
      sessionId: "s1",
      exerciseType: "scale_practice",
      recordedAt: "2026-01-01T00:00:00.000Z",
      scaleId: "pc0-major",
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
          centsDifference: 0,
          intonationBucket: "in_tune",
          missingData: false,
        },
      ],
      summary: {
        overallScore0to100: 90,
        averageAbsCents: 4.2,
        inTunePercent: 75,
        weakestNoteIndices: [],
        trend: "balanced",
        meanSignedCents: 0,
        notesAnalyzed: 1,
        notesMissing: 0,
      },
    });

    render(<ScalePracticeResultsPage />);
    await waitFor(() => {
      expect(screen.getByText(/C major/i)).toBeInTheDocument();
    });
    expect(screen.getByText("90")).toBeInTheDocument();
  });
});
