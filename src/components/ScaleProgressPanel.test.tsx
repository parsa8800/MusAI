import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import { ScaleSwitcherDrawer } from "@/components/ScaleSwitcherDrawer";
import {
  clearScalePracticeHistory,
  persistScalePracticeSession,
  readScalePracticeSession,
} from "@/lib/scalePracticeSession";
import { clearScaleProgressHistory } from "@/lib/scaleProgressHistory";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    className,
    "aria-label": ariaLabel,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    className?: string;
    "aria-label"?: string;
    "aria-current"?: "page";
  }) => (
    <a
      href={href}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
    >
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
}));

function makeSession(
  overrides: Partial<ScalePracticeSessionV1> = {},
): ScalePracticeSessionV1 {
  const base: ScalePracticeSessionV1 = {
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
      overallScore0to100: 88,
      averageAbsCents: 5,
      inTunePercent: 88,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: 1,
      notesMissing: 0,
    },
    scaleSource: "detected",
  };
  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...overrides.summary },
    notes: overrides.notes ?? base.notes,
  };
}

describe("ScaleProgressPanel", () => {
  beforeEach(() => {
    clearScaleProgressHistory();
    clearScalePracticeHistory();
  });

  afterEach(() => {
    clearScaleProgressHistory();
    clearScalePracticeHistory();
  });

  it("shows an empty state when there are no journeys", async () => {
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    expect(await screen.findByText("No scales yet")).toBeInTheDocument();
  });

  it("centres the My scales heading and supporting line", async () => {
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    const heading = await screen.findByRole("heading", { name: "My scales" });
    expect(heading.className).toMatch(/musai-scale-switcher__title/);
    const copy = heading.closest(".musai-scale-switcher__copy");
    expect(copy).toBeTruthy();
    expect(copy).toHaveTextContent(/already practised/i);
    expect(copy?.querySelector(".musai-scale-switcher__subtitle")).toHaveTextContent(
      /tap one to keep going/i,
    );
  });

  it("renders selectable cards with continue affordance", async () => {
    persistScalePracticeSession(
      makeSession({
        summary: {
          overallScore0to100: 55,
          averageAbsCents: 18,
          inTunePercent: 55,
          weakestNoteIndices: [],
          trend: "balanced",
          meanSignedCents: 0,
          notesAnalyzed: 1,
          notesMissing: 0,
        },
        notes: [
          {
            noteIndex: 0,
            expectedMidi: 60,
            expectedNoteLabel: "C4",
            detectedMidi: 60,
            detectedNoteLabel: "C4",
            detectedHz: 261,
            centsDifference: 30,
            intonationBucket: "sharp",
            missingData: false,
          },
        ],
      }),
    );
    persistScalePracticeSession(
      makeSession({
        sessionId: "s2",
        scaleId: "G_major",
        scaleLabel: "G major",
        tonicPitchClass: 7,
        octaveSpan: 2,
        summary: {
          overallScore0to100: 70,
          averageAbsCents: 12,
          inTunePercent: 70,
          weakestNoteIndices: [],
          trend: "balanced",
          meanSignedCents: 0,
          notesAnalyzed: 1,
          notesMissing: 0,
        },
        notes: [
          {
            noteIndex: 0,
            expectedMidi: 67,
            expectedNoteLabel: "G4",
            detectedMidi: 67,
            detectedNoteLabel: "G4",
            detectedHz: 392,
            centsDifference: 20,
            intonationBucket: "sharp",
            missingData: false,
          },
        ],
      }),
    );
    const onContinue = vi.fn();
    render(<ScaleProgressPanel onContinue={onContinue} />);

    expect(
      await screen.findByRole("link", { name: /Continue C major/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Scales you’ve already practised. Tap one to keep going.")).toBeInTheDocument();
    expect(screen.getByText("1 octave")).toBeInTheDocument();
    expect(screen.getByText("2 octaves")).toBeInTheDocument();
    expect(screen.getAllByText("1 take").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Continue").length).toBeGreaterThan(0);
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Continue G major/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0]?.[0]?.scaleLabel).toBe("G major");
  });

  it("shows Complete instead of a percent for a finished scale", async () => {
    persistScalePracticeSession(
      makeSession({
        summary: {
          overallScore0to100: 96,
          averageAbsCents: 3,
          inTunePercent: 100,
          weakestNoteIndices: [],
          trend: "balanced",
          meanSignedCents: 0,
          notesAnalyzed: 1,
          notesMissing: 0,
        },
      }),
    );
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    expect(await screen.findByText("Complete")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Continue C major.*complete/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("marks the current scale and skips navigation", async () => {
    persistScalePracticeSession(makeSession());
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ScaleProgressPanel
        onContinue={onContinue}
        onDismiss={onDismiss}
        currentProgressKey="C_major__1"
      />,
    );
    const current = await screen.findByRole("link", {
      name: /C major, this page/i,
    });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Here")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /More actions for C major/i }),
    ).toBeInTheDocument();
    fireEvent.click(current);
    expect(onContinue).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("resets a journey after confirmation and removes it from the list", async () => {
    persistScalePracticeSession(makeSession());
    const onJourneyReset = vi.fn();
    render(
      <ScaleProgressPanel onContinue={vi.fn()} onJourneyReset={onJourneyReset} />,
    );
    expect(
      await screen.findByRole("link", { name: /Continue C major/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /More actions for C major/i }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset scale" }));
    expect(
      screen.getByRole("dialog", { name: /Reset C major/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/removes it from My scales/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Continue C major/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /More actions for C major/i }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset scale" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: /Continue C major/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("No scales yet")).toBeInTheDocument();
    expect(readScalePracticeSession()).toBeNull();
    expect(onJourneyReset).toHaveBeenCalledTimes(1);
    expect(onJourneyReset.mock.calls[0]?.[0]?.progressKey).toBe("C_major__1");
  });
});

describe("ScaleSwitcherDrawer", () => {
  beforeEach(() => {
    clearScaleProgressHistory();
    clearScalePracticeHistory();
  });

  afterEach(() => {
    clearScaleProgressHistory();
    clearScalePracticeHistory();
  });

  it("toggles open state without unmounting the panel", async () => {
    persistScalePracticeSession(makeSession());
    const onClose = vi.fn();
    const { rerender, container } = render(
      <ScaleSwitcherDrawer
        open={false}
        onClose={onClose}
        id="scale-studio-my-scales"
        title="My scales"
        subtitle="Open a scale"
        onContinue={vi.fn()}
        newScaleHref="/practice/scale"
      />,
    );
    const root = container.querySelector(".musai-scales-switcher");
    expect(root).toHaveAttribute("data-open", "false");
    expect(container.querySelector(".musai-scale-switcher__title")?.textContent).toBe(
      "My scales",
    );
    expect(container.querySelector('a[href="/practice/scale"]')?.textContent).toContain(
      "New scale",
    );

    rerender(
      <ScaleSwitcherDrawer
        open
        onClose={onClose}
        id="scale-studio-my-scales"
        title="My scales"
        subtitle="Open a scale"
        onContinue={vi.fn()}
        newScaleHref="/practice/scale"
      />,
    );
    expect(root).toHaveAttribute("data-open", "true");
    expect(await screen.findByRole("heading", { name: "My scales" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New scale" })).toHaveAttribute(
      "href",
      "/practice/scale",
    );
    expect(screen.getByRole("link", { name: /Continue C major/i })).toHaveAttribute(
      "href",
      "/practice/scale/c-major-1oct",
    );
  });

  it("closes from the scrim and Escape", async () => {
    const onClose = vi.fn();
    render(
      <ScaleSwitcherDrawer
        open
        onClose={onClose}
        id="scale-workspace-switcher"
        title="Switch scale"
        subtitle="Pick one"
        onContinue={vi.fn()}
        newScaleHref="/practice/scale"
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Close scales" })[0]!);
    expect(onClose).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
