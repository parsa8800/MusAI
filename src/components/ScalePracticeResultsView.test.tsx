import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ScalePracticeResultsView } from "@/components/ScalePracticeResultsView";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ScaleTrebleStaff", () => ({
  ScaleTrebleStaff: () => <div data-testid="staff" />,
}));

vi.mock("@/components/ScoreRing", () => ({
  ScoreRing: ({ score }: { score: number }) => (
    <div data-testid="score-ring">{score}</div>
  ),
}));

vi.mock("@/components/CoachChatPanel", () => ({
  CoachChatPanel: ({
    start,
    tip,
  }: {
    start: boolean;
    tip: string;
  }) => (start ? <div data-testid="coach-chat">{tip}</div> : null),
}));

vi.mock("@/lib/scalePracticeSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scalePracticeSession")>();
  return {
    ...actual,
    clearScalePracticeSession: vi.fn(),
  };
});

const sampleSession = {
  schemaVersion: 1 as const,
  sessionId: "s1",
  exerciseType: "scale_practice" as const,
  recordedAt: "2026-01-01T00:00:00.000Z",
  scaleId: "pc0-major",
  scaleLabel: "C major",
  scaleKind: "major" as const,
  tonicPitchClass: 0,
  octaveSpan: 1 as const,
  octaveRangeLabel: "C4 → C5",
  rootMidi: 60,
  expectedNotesMidi: [60],
  audioSourceType: "uploaded" as const,
  sampleRateHz: 48000,
  scaleSource: "detected" as const,
  notes: [
    {
      noteIndex: 0,
      expectedMidi: 60,
      expectedNoteLabel: "C4",
      detectedMidi: 60,
      detectedNoteLabel: "C4",
      detectedHz: 261.6,
      centsDifference: 0,
      intonationBucket: "in_tune" as const,
      missingData: false,
    },
  ],
  summary: {
    overallScore0to100: 88,
    averageAbsCents: 8,
    inTunePercent: 90,
    weakestNoteIndices: [] as number[],
    trend: "balanced" as const,
    meanSignedCents: 0,
    notesAnalyzed: 1,
    notesMissing: 0,
  },
};

describe("ScalePracticeResultsView", () => {
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

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tip: "Nice take. Keep the same pulse.",
          trendLine: "Pitch bias looks centred.",
          source: "template",
        }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows score ring, staff, then coach chat", async () => {
    render(<ScalePracticeResultsView session={sampleSession} />);

    expect(screen.getByRole("heading", { name: /C major/i })).toBeInTheDocument();
    expect(screen.getByText(/Heard from your take/i)).toBeInTheDocument();
    expect(screen.getByTestId("score-ring")).toHaveTextContent("88");
    expect(screen.getByTestId("staff")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByTestId("coach-chat")).toBeInTheDocument();
  });
});
