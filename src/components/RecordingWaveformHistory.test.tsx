import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordingWaveformHistory } from "@/components/RecordingWaveformHistory";

describe("RecordingWaveformHistory", () => {
  it("draws a live canvas when a sample clock is provided", () => {
    const liveClockRef = { current: { samples: [0.2, 0.8], times: [1, 2] } };
    const { container } = render(
      <RecordingWaveformHistory
        live
        liveClockRef={liveClockRef}
        samples={[0.2, 0.8]}
        label="Live recording volume history"
      />,
    );
    expect(container.querySelector(".musai-rec-wave__canvas")).toBeTruthy();
    expect(container.querySelector(".musai-rec-wave__playhead")).toBeTruthy();
    expect(container.querySelector(".musai-rec-wave__line")).toBeNull();
    expect(container.querySelectorAll(".musai-rec-wave__bar").length).toBe(0);
  });

  it("keeps the take visible when live stops before React samples flush", () => {
    const liveClockRef = {
      current: { samples: [0.2, 0.8, 0.5], times: [1, 2, 3] },
    };
    const { container, rerender } = render(
      <RecordingWaveformHistory
        live
        liveClockRef={liveClockRef}
        samples={[]}
        label="Live recording volume history"
      />,
    );
    rerender(
      <RecordingWaveformHistory
        live={false}
        liveClockRef={liveClockRef}
        samples={[]}
        label="Recorded take volume history"
      />,
    );
    const bars = [...container.querySelectorAll(".musai-rec-wave__bar")];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.some((bar) => bar.getAttribute("data-quiet") !== "true")).toBe(
      true,
    );
  });

  it("draws a live playhead and keeps history in a scrolling window", () => {
    const { container } = render(
      <RecordingWaveformHistory
        live
        samples={[0.1, 0.8, 0.4]}
        label="Live recording volume history"
      />,
    );
    expect(
      screen.getByRole("img", { name: /live recording volume history/i }),
    ).toHaveAttribute("data-live", "true");
    expect(container.querySelector(".musai-rec-wave__playhead")).toBeTruthy();
    expect(container.querySelectorAll(".musai-rec-wave__bar").length).toBe(3);
  });

  it("freezes a completed take without a playhead", () => {
    const { container, rerender } = render(
      <RecordingWaveformHistory
        live
        samples={[0.2, 0.9, 0.3]}
        label="Live recording volume history"
      />,
    );
    rerender(
      <RecordingWaveformHistory
        live={false}
        samples={[0.2, 0.9, 0.3]}
        label="Recorded take volume history"
      />,
    );
    expect(
      screen.getByRole("img", { name: /recorded take volume history/i }),
    ).toHaveAttribute("data-live", "false");
    expect(container.querySelector(".musai-rec-wave__playhead")).toBeNull();
  });

  it("clears bars when the take is discarded", () => {
    const { container, rerender } = render(
      <RecordingWaveformHistory samples={[0.8, 0.6]} label="Take" />,
    );
    rerender(
      <RecordingWaveformHistory samples={[]} label="Take" />,
    );
    expect(container.querySelectorAll(".musai-rec-wave__bar").length).toBe(0);
  });

  it("exposes tape layout by default and accepts timeline markers for Piece Studio", () => {
    const { container, rerender } = render(
      <RecordingWaveformHistory samples={[0.2, 0.8]} label="Take" />,
    );
    expect(container.querySelector(".musai-rec-wave")).toHaveAttribute(
      "data-layout",
      "tape",
    );
    expect(container.querySelector(".musai-rec-wave__marker")).toBeNull();

    rerender(
      <RecordingWaveformHistory
        layout="timeline"
        samples={[0.2, 0.8]}
        durationMs={4000}
        markers={[{ id: "m1", timeMs: 1000, label: "Sharp" }]}
        label="Piece take"
      />,
    );
    expect(container.querySelector(".musai-rec-wave")).toHaveAttribute(
      "data-layout",
      "timeline",
    );
    expect(container.querySelector(".musai-rec-wave__marker")).toBeTruthy();
  });
});
