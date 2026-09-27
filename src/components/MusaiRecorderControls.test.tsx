import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MusaiRecorderControls } from "@/components/MusaiMicCapturePanel";

function renderStudio(
  isRecording: boolean,
  extra?: { waveform?: number[]; clip?: boolean; discard?: () => void; busy?: boolean },
) {
  return render(
    <MusaiRecorderControls
      isRecording={isRecording}
      onStartRecording={vi.fn()}
      onStopRecording={vi.fn()}
      onDiscardRecording={extra?.discard ?? vi.fn()}
      elapsedLabel={isRecording ? "00:08.15" : "00:00.00"}
      lastTakeLabel={extra?.clip ? "00:08.15" : null}
      levelBars={[0.2, 0.4, 0.3]}
      waveformSamples={extra?.waveform ?? (isRecording ? [0.2, 0.8, 0.4] : [])}
      hasSavedClip={extra?.clip ?? false}
      experience="studio"
      idleTitle="Take 1"
      idleHint="Play the scale"
      startAriaLabel="Record take 1"
      busy={extra?.busy}
    />,
  );
}

function slotOrder(container: HTMLElement) {
  return [...container.querySelectorAll("[data-rec-slot]")].map((el) =>
    el.getAttribute("data-rec-slot"),
  );
}

describe("MusaiRecorderControls studio layout", () => {
  it("keeps idle studio bar to record until capture starts", () => {
    const { container, rerender } = renderStudio(false);
    expect(slotOrder(container)).toEqual(["button", "action"]);
    expect(container.querySelector("[data-rec-stage]")).toHaveAttribute(
      "data-layout",
      "bar",
    );
    expect(screen.getByTestId("musai-rec-anchor")).toBeInTheDocument();
    expect(screen.queryByText("Take 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Play the scale")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Record", { selector: ".musai-rec-stage__caption" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-rec-slot="action"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Discard take" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /recording volume history/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".musai-rec-wave-well")).toBeNull();
    expect(screen.queryByText("00:00.00")).not.toBeInTheDocument();

    rerender(
      <MusaiRecorderControls
        isRecording
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
        onDiscardRecording={vi.fn()}
        elapsedLabel="00:08.15"
        levelBars={[0.2, 0.4]}
        waveformSamples={[0.2, 0.8, 0.4]}
        experience="studio"
        idleTitle="Take 1"
        idleHint="Play the scale"
        startAriaLabel="Record take 1"
      />,
    );
    expect(slotOrder(container)).toEqual(["button", "wave", "timer", "action"]);
    expect(screen.getByTestId("musai-rec-anchor")).toHaveAttribute(
      "aria-label",
      "Stop recording",
    );
    expect(
      screen.queryByText("Stop", { selector: ".musai-rec-stage__caption" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard take" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /live recording volume history/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("00:08.15")).toBeInTheDocument();
  });

  it("hides the tape after a completed take", () => {
    const { container, rerender } = renderStudio(true, {
      waveform: [0.1, 0.9, 0.3, 0.6],
    });
    expect(slotOrder(container)).toEqual(["button", "wave", "timer", "action"]);
    rerender(
      <MusaiRecorderControls
        isRecording={false}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
        onDiscardRecording={vi.fn()}
        elapsedLabel="00:00.00"
        lastTakeLabel="00:08.15"
        levelBars={[0.08]}
        waveformSamples={[0.1, 0.9, 0.3, 0.6]}
        hasSavedClip
        experience="studio"
        idleTitle="Take 1"
        idleHint="Play the scale"
        startAriaLabel="Record take 1"
      />,
    );
    expect(slotOrder(container)).toEqual(["button", "action"]);
    expect(
      screen.queryByRole("img", { name: /recorded take volume history/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("00:08.15")).not.toBeInTheDocument();
    expect(screen.queryByText("00:00.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard take" })).not.toBeInTheDocument();
  });

  it("does not unmount the record control when discard is shown", () => {
    renderStudio(true, { waveform: [0.4] });
    expect(screen.getByRole("button", { name: "Discard take" })).toBeInTheDocument();
    expect(screen.getByTestId("musai-rec-anchor")).toBeInTheDocument();
  });

  it("discards the take from the cancel control", () => {
    const onDiscard = vi.fn();
    renderStudio(true, { discard: onDiscard });
    fireEvent.click(screen.getByRole("button", { name: "Discard take" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard take?")).not.toBeInTheDocument();
  });

  it("keeps the record control anchored while analysing", () => {
    renderStudio(false, { busy: true, clip: true, waveform: [0.2] });
    const anchor = screen.getByTestId("musai-rec-anchor");
    expect(anchor).toBeDisabled();
    expect(anchor).toHaveAttribute("aria-label", "Analysing take");
    expect(anchor).toHaveAttribute("data-analysing", "true");
    expect(
      screen.queryByText("Analysing", { selector: ".musai-rec-stage__caption" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard take" })).not.toBeInTheDocument();
    expect(slotOrder(anchor.closest("[data-rec-stage]") as HTMLElement)).toEqual([
      "button",
      "action",
    ]);
    expect(
      screen.queryByRole("img", { name: /recording volume history/i }),
    ).not.toBeInTheDocument();
  });
});
