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
  it("keeps the same slot order from idle to recording", () => {
    const { container, rerender } = renderStudio(false);
    const idleSlots = slotOrder(container);
    expect(idleSlots).toEqual(["status", "button", "wave", "timer", "action"]);
    expect(screen.getByTestId("musai-rec-anchor")).toBeInTheDocument();
    expect(screen.getByText("Record")).toBeInTheDocument();
    expect(container.querySelector('[data-rec-slot="action"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /recording volume history/i }),
    ).toBeInTheDocument();

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
    expect(slotOrder(container)).toEqual(idleSlots);
    expect(screen.getByTestId("musai-rec-anchor")).toHaveAttribute(
      "aria-label",
      "Stop recording",
    );
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("keeps the same slot order from recording to a completed take", () => {
    const { container, rerender } = renderStudio(true, {
      waveform: [0.1, 0.9, 0.3, 0.6],
    });
    const recSlots = slotOrder(container);
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
    expect(slotOrder(container)).toEqual(recSlots);
    expect(
      screen.getByRole("img", { name: /recorded take volume history/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("00:08.15")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });

  it("does not unmount the record control when discard is shown", () => {
    renderStudio(true, { waveform: [0.4] });
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByTestId("musai-rec-anchor")).toBeInTheDocument();
  });

  it("asks to confirm discard and only then throws the take away", () => {
    const onDiscard = vi.fn();
    renderStudio(true, { discard: onDiscard });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByText("Discard take?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep recording" }));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("keeps the record control anchored while analysing", () => {
    renderStudio(false, { busy: true, clip: true, waveform: [0.2] });
    const anchor = screen.getByTestId("musai-rec-anchor");
    expect(anchor).toBeDisabled();
    expect(anchor).toHaveAttribute("aria-label", "Analysing take");
    expect(anchor).toHaveAttribute("data-analysing", "true");
    expect(
      screen.getByText("Analysing", { selector: ".musai-rec-stage__caption" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(slotOrder(anchor.closest("[data-rec-stage]") as HTMLElement)).toEqual([
      "status",
      "button",
      "wave",
      "timer",
      "action",
    ]);
  });
});
