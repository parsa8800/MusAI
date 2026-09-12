import { createRef, type ChangeEvent } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MusaiCaptureDock } from "@/components/MusaiCaptureDock";

function renderDock(mode: "record" | "upload", onCaptureMode = vi.fn()) {
  return render(
    <MusaiCaptureDock
      selectId="test-mic"
      captureMode={mode}
      onCaptureMode={onCaptureMode}
      isRecording={false}
      recordedBlob={null}
      file={null}
      uploadProcessing={false}
      fileInputRef={createRef<HTMLInputElement | null>()}
      onFileChange={(_e: ChangeEvent<HTMLInputElement>) => undefined}
      mainRecorderRef={createRef<HTMLDivElement | null>()}
      micDevices={[]}
      selectedMicId=""
      onMicChange={vi.fn()}
      onMicRefresh={vi.fn()}
      onDiscardClip={vi.fn()}
      onStartRecording={vi.fn()}
      onStopRecording={vi.fn()}
      streamRef={createRef<MediaStream | null>()}
      elapsedLabel="00:00.00"
      levelBars={[]}
      lastTakeLabel={null}
      message={null}
      status="idle"
      canAnalyze={false}
      onAnalyze={vi.fn()}
      hideAnalyze
      nextTake={{
        label: "Take 1",
        hint: "Play the scale",
        ariaLabel: "Record take 1",
      }}
    />,
  );
}

describe("MusaiCaptureDock mode stage", () => {
  it("keeps Record and Import panels mounted in one stacked stage", () => {
    const { container } = renderDock("record");
    const stage = container.querySelector(".musai-capture-strip__stage");
    const panels = [
      ...container.querySelectorAll(".musai-capture-strip__panel"),
    ];
    expect(stage).toBeTruthy();
    expect(panels).toHaveLength(2);
    expect(panels[0]).toHaveAttribute("data-mode", "record");
    expect(panels[0]).toHaveAttribute("data-active", "true");
    expect(panels[1]).toHaveAttribute("data-mode", "upload");
    expect(panels[1]).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("tab", { name: "Record" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not unmount the other mode when switching", () => {
    const onCaptureMode = vi.fn();
    const { container, rerender } = renderDock("record", onCaptureMode);
    fireEvent.click(screen.getByRole("tab", { name: "Import" }));
    expect(onCaptureMode).toHaveBeenCalledWith("upload");

    rerender(
      <MusaiCaptureDock
        selectId="test-mic"
        captureMode="upload"
        onCaptureMode={onCaptureMode}
        isRecording={false}
        recordedBlob={null}
        file={null}
        uploadProcessing={false}
        fileInputRef={createRef<HTMLInputElement | null>()}
        onFileChange={vi.fn()}
        mainRecorderRef={createRef<HTMLDivElement | null>()}
        micDevices={[]}
        selectedMicId=""
        onMicChange={vi.fn()}
        onMicRefresh={vi.fn()}
        onDiscardClip={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
        streamRef={createRef<MediaStream | null>()}
        elapsedLabel="00:00.00"
        levelBars={[]}
        lastTakeLabel={null}
        message={null}
        status="idle"
        canAnalyze={false}
        onAnalyze={vi.fn()}
        hideAnalyze
        nextTake={{
          label: "Take 1",
          hint: "Play the scale",
          ariaLabel: "Record take 1",
        }}
      />,
    );

    const panels = [
      ...container.querySelectorAll(".musai-capture-strip__panel"),
    ];
    expect(panels).toHaveLength(2);
    expect(panels[0]).toHaveAttribute("data-active", "false");
    expect(panels[1]).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("tab", { name: "Import" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Import audio")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='musai-rec-anchor']")).toBeTruthy();
  });

  it("shows a reserved analysing state instead of the ready green", () => {
    const { container, rerender } = renderDock("record");
    const blob = new Blob(["x"], { type: "audio/webm" });
    rerender(
      <MusaiCaptureDock
        selectId="test-mic"
        captureMode="record"
        onCaptureMode={vi.fn()}
        isRecording={false}
        recordedBlob={blob}
        file={null}
        uploadProcessing={false}
        fileInputRef={createRef<HTMLInputElement | null>()}
        onFileChange={vi.fn()}
        mainRecorderRef={createRef<HTMLDivElement | null>()}
        micDevices={[]}
        selectedMicId=""
        onMicChange={vi.fn()}
        onMicRefresh={vi.fn()}
        onDiscardClip={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
        streamRef={createRef<MediaStream | null>()}
        elapsedLabel="00:00.00"
        levelBars={[]}
        lastTakeLabel={null}
        message={null}
        status="loading"
        canAnalyze={false}
        onAnalyze={vi.fn()}
        hideAnalyze
        nextTake={{
          label: "Take 1",
          hint: "Play the scale",
          ariaLabel: "Record take 1",
        }}
      />,
    );
    const strip = container.querySelector(".musai-capture-strip");
    expect(strip).toHaveClass("musai-capture-strip--analysing");
    expect(strip).not.toHaveClass("musai-capture-strip--ready");
    expect(screen.getByRole("tab", { name: "Import" })).toBeDisabled();
  });
});
