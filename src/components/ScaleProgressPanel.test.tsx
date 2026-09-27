import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ScaleProgressPanel } from "@/components/ScaleProgressPanel";
import { ScaleSwitcherDrawer } from "@/components/ScaleSwitcherDrawer";
import {
  clearScalePracticeHistory,
  persistScalePracticeSession,
} from "@/lib/scalePracticeSession";
import { clearScaleProgressHistory } from "@/lib/scaleProgressHistory";
import { INSTRUMENT_STORAGE_KEY } from "@/lib/instrument";
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
    window.localStorage.removeItem(INSTRUMENT_STORAGE_KEY);
  });

  it("shows an empty state when there are no journeys", async () => {
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    expect(await screen.findByText("No scales yet")).toBeInTheDocument();
  });

  it("centres the My scales heading without extra copy", async () => {
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    const heading = await screen.findByRole("heading", { name: "My scales" });
    expect(heading.className).toMatch(/musai-scale-switcher__title/);
    const copy = heading.closest(".musai-scale-switcher__copy");
    expect(copy).toBeTruthy();
    expect(copy?.querySelector(".musai-scale-switcher__subtitle")).toBeNull();
    expect(screen.queryByText(/already practised/i)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/already practised/i)).not.toBeInTheDocument();
    expect(screen.queryByText("1 octave")).not.toBeInTheDocument();
    expect(screen.queryByText("2 octaves")).not.toBeInTheDocument();
    expect(screen.queryByText(/take/i)).not.toBeInTheDocument();
    expect(screen.queryByText("In progress")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Continue /i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("link", { name: /Continue G major/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue.mock.calls[0]?.[0]?.scaleLabel).toBe("G major");
  });

  it("fills the bar for a finished scale without a percent", async () => {
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
    const link = await screen.findByRole("link", {
      name: /Continue C major.*complete/i,
    });
    expect(link.querySelector(".musai-scale-switcher__meter")).toHaveAttribute(
      "data-progress",
      "100",
    );
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
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
        currentProgressKey="violin__C_major__1"
      />,
    );
    const current = await screen.findByRole("link", {
      name: /C major, this page/i,
    });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Here")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close scales" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
    fireEvent.click(current);
    expect(onContinue).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hides violin journeys in viola mode without deleting them", async () => {
    persistScalePracticeSession(makeSession({ instrumentId: "violin" }));
    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, "viola");
    const violaView = render(<ScaleProgressPanel onContinue={vi.fn()} />);
    expect(await screen.findByText("No scales yet")).toBeInTheDocument();
    violaView.unmount();

    window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, "violin");
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    expect(
      await screen.findByRole("link", { name: /Continue C major/i }),
    ).toBeInTheDocument();
  });

  it("does not put a remove control on a scale row", async () => {
    persistScalePracticeSession(makeSession());
    render(<ScaleProgressPanel onContinue={vi.fn()} />);
    expect(
      await screen.findByRole("link", { name: /Continue C major/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Remove$/)).not.toBeInTheDocument();
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
