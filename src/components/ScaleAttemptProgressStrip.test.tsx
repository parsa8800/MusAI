import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScaleAttemptProgressStrip } from "@/components/ScaleAttemptProgressStrip";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

function makeSession(
  partial: Partial<{
    sessionId: string;
    inTunePercent: number;
    inTuneCount: number;
    total: number;
    notesAnalyzed?: number;
  }> = {},
): ScalePracticeSessionV1 {
  const total = partial.total ?? 8;
  const inTuneCount = partial.inTuneCount ?? Math.round((partial.inTunePercent ?? 90) / 12.5);
  const analyzed = partial.notesAnalyzed ?? total;
  const notes = Array.from({ length: total }, (_, i) => {
    const missing = i >= analyzed;
    const inTune = !missing && i < inTuneCount;
    return {
      noteIndex: i,
      expectedMidi: 60 + i,
      expectedNoteLabel: "C4",
      detectedMidi: missing ? 0 : 60 + i,
      detectedNoteLabel: missing ? "—" : "C4",
      detectedHz: missing ? 0 : 261,
      centsDifference: missing ? 0 : inTune ? 0 : 40,
      intonationBucket: missing
        ? ("unknown" as const)
        : inTune
          ? ("in_tune" as const)
          : ("sharp" as const),
      missingData: missing,
    };
  });
  return {
    schemaVersion: 1,
    sessionId: partial.sessionId ?? "s1",
    exerciseType: "scale_practice",
    recordedAt: "2026-01-01T00:00:00.000Z",
    scaleId: "pc0-major",
    scaleLabel: "C major",
    scaleKind: "major",
    tonicPitchClass: 0,
    octaveSpan: 1,
    octaveRangeLabel: "C4 → C5",
    rootMidi: 60,
    expectedNotesMidi: notes.map((n) => n.expectedMidi),
    audioSourceType: "uploaded",
    sampleRateHz: 48000,
    notes,
    summary: {
      overallScore0to100: partial.inTunePercent ?? 90,
      averageAbsCents: 8,
      inTunePercent: partial.inTunePercent ?? 90,
      weakestNoteIndices: [],
      trend: "balanced",
      meanSignedCents: 0,
      notesAnalyzed: analyzed,
      notesMissing: total - analyzed,
    },
  };
}

describe("ScaleAttemptProgressStrip", () => {
  it("shows a Progress label, percentage, and bar without take chrome", () => {
    const a = makeSession({
      sessionId: "a",
      inTunePercent: 40,
      inTuneCount: 3,
    });
    const b = makeSession({
      sessionId: "b",
      inTunePercent: 70,
      inTuneCount: 5,
    });
    render(<ScaleAttemptProgressStrip session={b} loopAttempts={[a, b]} />);

    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.queryByText(/Take 2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Play it again/i)).not.toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    const now = Number(bar.getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThanOrEqual(40);
    expect(now).toBeLessThan(90);
    expect(screen.getByText(`${now}%`)).toBeInTheDocument();
    expect(screen.queryByText("1/3")).not.toBeInTheDocument();
    expect(screen.queryByText(/\+50%/)).not.toBeInTheDocument();
  });

  it("shows completion copy when mastery reaches 100", () => {
    const great = makeSession({
      sessionId: "g",
      inTunePercent: 100,
      inTuneCount: 8,
      total: 8,
    });
    render(<ScaleAttemptProgressStrip session={great} loopAttempts={[great]} />);
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Complete$/);
  });

  it("shows a frozen take waveform from stored amplitudes", () => {
    const take = makeSession({
      sessionId: "w",
      inTunePercent: 50,
      inTuneCount: 4,
    });
    take.waveformAmplitudes = [0.2, 0.9, 0.4, 0.1];
    render(<ScaleAttemptProgressStrip session={take} loopAttempts={[take]} />);
    expect(
      screen.getByRole("img", { name: /this take volume history/i }),
    ).toBeInTheDocument();
  });

  it("marks the percentage after a new best without extra copy", () => {
    const a = makeSession({
      sessionId: "a",
      inTunePercent: 40,
      inTuneCount: 3,
    });
    const b = makeSession({
      sessionId: "b",
      inTunePercent: 55,
      inTuneCount: 4,
    });
    render(
      <ScaleAttemptProgressStrip
        session={b}
        loopAttempts={[a, b]}
        showNewBest
      />,
    );
    expect(screen.queryByText(/New best/i)).not.toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    const pct = screen.getByText(`${bar.getAttribute("aria-valuenow")}%`);
    expect(pct.className).toMatch(/musai-scale-progress-pct--best/);
  });

  it("shows historical progress for an older take without changing latest math", () => {
    const early = makeSession({
      sessionId: "early",
      inTunePercent: 40,
      inTuneCount: 3,
    });
    early.masteryPercentAfterTake = 40;
    const mid = makeSession({
      sessionId: "mid",
      inTunePercent: 70,
      inTuneCount: 5,
    });
    mid.masteryPercentAfterTake = 68;
    const latest = makeSession({
      sessionId: "latest",
      inTunePercent: 100,
      inTuneCount: 8,
      total: 8,
    });
    latest.masteryPercentAfterTake = 100;

    const { rerender } = render(
      <ScaleAttemptProgressStrip
        session={mid}
        loopAttempts={[early, mid, latest]}
      />,
    );

    expect(screen.getByText("This take")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progress at this take" }),
    ).toHaveAttribute("aria-valuenow", "68");
    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.queryByText(/Take 4 ·/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Progress")).not.toBeInTheDocument();

    rerender(
      <ScaleAttemptProgressStrip
        session={latest}
        loopAttempts={[early, mid, latest]}
      />,
    );
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.queryByText("This take")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
