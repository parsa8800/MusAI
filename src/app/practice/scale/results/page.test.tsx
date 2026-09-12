import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const readScalePracticeSessionMock = vi.fn();
vi.mock("@/lib/scalePracticeSession", () => ({
  readScalePracticeSession: () => readScalePracticeSessionMock(),
  readScalePracticeHistoryEntry: () => null,
  persistScalePracticeSession: vi.fn(),
  clearScalePracticeSession: vi.fn(),
  formatScaleTakeSubtitle: () => "Detected · 1 octave",
}));

import ScalePracticeResultsPage from "@/app/practice/scale/results/page";

describe("ScalePracticeResultsPage", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("renders a hydration-safe loading shell first", () => {
    readScalePracticeSessionMock.mockReturnValue(null);
    render(<ScalePracticeResultsPage />);
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
  });

  it("sends an empty session back to Scale studio", async () => {
    readScalePracticeSessionMock.mockReturnValue(null);
    render(<ScalePracticeResultsPage />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/practice/scale");
    });
  });

  it("opens the matching scale page when a session exists", async () => {
    readScalePracticeSessionMock.mockReturnValue({
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
      notes: [],
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
      expect(replace).toHaveBeenCalledWith("/practice/scale/c-major-1oct?root=60");
    });
  });
});
