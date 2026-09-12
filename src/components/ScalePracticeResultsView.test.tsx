import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

function overlayScreen() {
  const root = document.getElementById("musai-overlay-root");
  if (!root) throw new Error("expected #musai-overlay-root");
  return within(root);
}

function makeSession(
  partial: Partial<{
    sessionId: string;
    inTunePercent: number;
    masteryPercentAfterTake: number;
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
    ...(partial.masteryPercentAfterTake != null
      ? { masteryPercentAfterTake: partial.masteryPercentAfterTake }
      : {}),
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
        json: async () => ({ reply: "• Try that note slowly", source: "template" }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leads with a progress bar, not percents-as-lecture or take chrome", async () => {
    render(<ScalePracticeResultsView session={makeSession()} />);

    expect(
      screen.getByRole("link", { name: /Back to Scale studio/i }),
    ).toHaveAttribute("href", "/practice/scale");
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.queryByText(/^Take 1$/)).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText(/1 octave/i)).toBeInTheDocument();
    expect(screen.queryByText(/First take logged/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 of 3 clean/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs work/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Strongest/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^C major$/i })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Complete$/);
    expect(screen.getByTestId("staff")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try again/i })).toHaveAttribute(
      "href",
      "/practice/scale",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByTestId("coach-chat")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Try again in-loop without extra progress copy", async () => {
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
    expect(screen.getByRole("button", { name: /Take history, 2 takes/i })).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.queryByText(/New best/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+7% from previous/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best so far 47%/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Back to Scale studio/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("centres the scale title above take info in the notation column", () => {
    const first = makeSession({ sessionId: "take-1", inTunePercent: 40 });
    first.notes = [
      {
        ...first.notes[0]!,
        intonationBucket: "sharp",
        centsDifference: 30,
      },
    ];
    first.summary = {
      ...first.summary,
      overallScore0to100: 40,
      inTunePercent: 40,
    };
    const second = makeSession({ sessionId: "take-2", inTunePercent: 70 });
    second.notes = [
      {
        ...second.notes[0]!,
        intonationBucket: "sharp",
        centsDifference: 25,
      },
    ];
    second.summary = {
      ...second.summary,
      overallScore0to100: 70,
      inTunePercent: 70,
    };

    render(
      <ScalePracticeResultsView
        session={second}
        loopAttempts={[first, second]}
        capture={<div data-testid="studio-capture">Record</div>}
      />,
    );

    const heading = screen.getByRole("heading", { name: /^C major$/i });
    expect(heading.className).toMatch(/musai-scale-staff-heading__title/);
    expect(heading.closest(".musai-scale-staff-heading")).toBeTruthy();
    expect(screen.getByText(/1 octave/i).className).toMatch(
      /musai-scale-staff-heading__take/,
    );

    fireEvent.click(screen.getByRole("button", { name: /Take history/i }));
    fireEvent.click(overlayScreen().getByRole("option", { name: /Take 1/i }));
    const back = screen.getByRole("button", { name: /Back to latest take/i });
    expect(back.className).toMatch(/musai-scale-staff-heading__back/);
    expect(back).toHaveTextContent("Latest");
    expect(screen.getByText(/^Take 1$/)).toBeInTheDocument();
  });

  it("keeps recording on the results layout instead of a retry link", () => {
    render(
      <ScalePracticeResultsView
        session={makeSession()}
        capture={<div data-testid="studio-capture">Record</div>}
      />,
    );
    expect(screen.getByTestId("studio-capture")).toBeInTheDocument();
    expect(screen.getByTestId("staff")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Try again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Practice hub/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("studio-capture").closest("[data-studio-phase]")).toHaveAttribute(
      "data-studio-phase",
      "results",
    );
  });

  it("replaces the main take in place when a newer session arrives", () => {
    const first = makeSession({ sessionId: "take-1" });
    const second = makeSession({ sessionId: "take-2", inTunePercent: 55 });
    const { rerender } = render(
      <ScalePracticeResultsView session={first} loopAttempts={[first]} />,
    );
    expect(screen.getByRole("progressbar", { name: "Progress" })).toBeInTheDocument();
    rerender(
      <ScalePracticeResultsView
        session={second}
        loopAttempts={[first, second]}
      />,
    );
    expect(screen.getByRole("button", { name: /Take history, 2 takes/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /C major/i })).toBeInTheDocument();
  });

  it("lets you inspect an earlier take and return to the latest", () => {
    const first = makeSession({
      sessionId: "take-1",
      inTunePercent: 40,
      masteryPercentAfterTake: 40,
    });
    first.notes = [
      {
        ...first.notes[0]!,
        expectedNoteLabel: "D4",
        intonationBucket: "sharp",
        centsDifference: 30,
      },
    ];
    const second = makeSession({
      sessionId: "take-2",
      inTunePercent: 90,
      masteryPercentAfterTake: 90,
    });
    second.notes = [
      {
        ...second.notes[0]!,
        expectedNoteLabel: "D4",
        intonationBucket: "in_tune",
        centsDifference: 0,
      },
    ];
    render(
      <ScalePracticeResultsView
        session={second}
        loopAttempts={[first, second]}
        capture={<div data-testid="studio-capture">Record</div>}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Take history, 2 takes/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: /Take history/i })).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("What changed this take"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/D is now in tune/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Improved")).not.toBeInTheDocument();
    expect(screen.queryByText("New issue")).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progress" }),
    ).toHaveAttribute("aria-valuenow", "90");

    fireEvent.click(screen.getByRole("button", { name: /Take history/i }));
    fireEvent.click(overlayScreen().getByRole("option", { name: /Take 1/i }));
    expect(screen.getByText(/^Take 1$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to latest take/i })).toHaveTextContent(
      "Latest",
    );
    expect(screen.getByText("This take")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progress at this take" }),
    ).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByTestId("staff")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back to latest take/i }));
    expect(screen.queryByRole("button", { name: /Back to latest take/i })).not.toBeInTheDocument();
    expect(screen.getByText(/1 octave/i)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progress" }),
    ).toHaveAttribute("aria-valuenow", "90");
  });

  it("hides the duplicate scale heading when pick-notes chrome already names the scale", () => {
    render(
      <ScalePracticeResultsView
        capture={<div data-testid="studio-capture">Record</div>}
        showStaffHeading={false}
        readyTitle="C major"
        readyCaption=""
        readyStaff={{
          ascendingMidis: [60, 62, 64, 65, 67, 69, 71, 72],
          descendingMidis: [],
          tonicPitchClass: 0,
          scaleKind: "major",
        }}
        staffChrome={<div>Pick chrome</div>}
      />,
    );

    const heading = screen.getByRole("heading", { name: "C major" });
    expect(heading).toHaveClass("sr-only");
    expect(heading.className).not.toMatch(/musai-scale-staff-heading__title/);
    expect(screen.queryByText(/1 octave/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ascending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Up & down/i)).not.toBeInTheDocument();
  });
});
