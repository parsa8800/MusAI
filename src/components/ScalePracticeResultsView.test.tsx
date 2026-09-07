import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ScalePracticeResultsView } from "@/components/ScalePracticeResultsView";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <a href={href} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ScaleTrebleStaff", () => ({
  ScaleTrebleStaff: () => <div data-testid="staff" />,
}));

vi.mock("@/components/PracticeStageRing", () => ({
  PracticeStageRing: ({ label }: { label: string }) => (
    <div data-testid="stage-ring">{label}</div>
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
    listScalePracticeHistory: vi.fn(() => []),
  };
});

function makeSession(
  partial: Partial<{
    sessionId: string;
    inTunePercent: number;
  }> = {},
) {
  return {
    schemaVersion: 1 as const,
    sessionId: partial.sessionId ?? "s1",
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
      overallScore0to100: partial.inTunePercent ?? 88,
      averageAbsCents: 8,
      inTunePercent: partial.inTunePercent ?? 90,
      weakestNoteIndices: [] as number[],
      trend: "balanced" as const,
      meanSignedCents: 0,
      notesAnalyzed: 1,
      notesMissing: 0,
    },
  };
}

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

  it("leads with stage and progress, not a dominant raw score", async () => {
    render(<ScalePracticeResultsView session={makeSession()} />);

    expect(
      screen.getByRole("link", { name: /Back to Scale studio/i }),
    ).toHaveAttribute("href", "/practice/scale");
    expect(screen.getByTestId("stage-ring")).toHaveTextContent("Excellent");
    expect(screen.getByText(/First take logged/i)).toBeInTheDocument();
    expect(screen.getByText(/Pitch accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.queryByText(/Needs work/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Strongest/i)).toBeInTheDocument();
    expect(screen.getByText(/^Next$/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /C major/i })).toBeInTheDocument();
    expect(screen.getByTestId("staff")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try again/i })).toHaveAttribute(
      "href",
      "/practice/scale",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByTestId("coach-chat")).toBeInTheDocument();
  });

  it("keeps Try again in-loop with take and improvement chips", async () => {
    const onTryAgain = vi.fn();
    const a = makeSession({ sessionId: "a", inTunePercent: 40 });
    const b = makeSession({ sessionId: "b", inTunePercent: 47 });

    render(
      <ScalePracticeResultsView
        session={b}
        loopAttempts={[a, b]}
        onTryAgain={onTryAgain}
      />,
    );

    expect(screen.getByText(/Same scale · keep going/i)).toBeInTheDocument();
    expect(screen.getByText(/Take 2/i)).toBeInTheDocument();
    expect(screen.getByText(/\+7% from previous/i)).toBeInTheDocument();
    expect(screen.getByText(/New best/i)).toBeInTheDocument();
    expect(screen.getByText(/Best so far 47%/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Back to Scale studio/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});
