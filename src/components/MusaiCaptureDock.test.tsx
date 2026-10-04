import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
      onFileSelected={vi.fn()}
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
    expect(container.querySelector(".musai-rec-bar")).toBeTruthy();
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
        onFileSelected={vi.fn()}
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
    expect(screen.getByTestId("scale-file-import")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='musai-rec-anchor']")).toBeTruthy();
  });

  it("routes click and drop through onFileSelected once", () => {
    const onFileSelected = vi.fn();
    const inputRef = createRef<HTMLInputElement | null>();
    render(
      <MusaiCaptureDock
        selectId="test-mic"
        captureMode="upload"
        onCaptureMode={vi.fn()}
        isRecording={false}
        recordedBlob={null}
        file={null}
        uploadProcessing={false}
        fileInputRef={inputRef}
        onFileSelected={onFileSelected}
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
      />,
    );

    const picked = new File([new Uint8Array(16)], "scale.wav", {
      type: "audio/wav",
    });
    fireEvent.change(inputRef.current!, { target: { files: [picked] } });
    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected).toHaveBeenCalledWith(picked);

    const zone = screen.getByTestId("scale-file-import");
    const dropped = new File([new Uint8Array(16)], "scale.mp3", {
      type: "audio/mpeg",
    });
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [dropped],
        items: [{ kind: "file", type: dropped.type, getAsFile: () => dropped }],
        types: ["Files"],
      },
    });
    expect(onFileSelected).toHaveBeenCalledTimes(2);
    expect(onFileSelected).toHaveBeenLastCalledWith(dropped);
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
        onFileSelected={vi.fn()}
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

  it("shows a success tick for an imported file, then clears it", () => {
    vi.useFakeTimers();
    const file = new File(["a"], "clean.m4a", { type: "audio/mp4" });
    const view = renderDock("upload");
    expect(view.container.querySelector(".musai-import-tick")).toBeNull();

    view.rerender(
      <MusaiCaptureDock
        selectId="test-mic"
        captureMode="upload"
        onCaptureMode={vi.fn()}
        isRecording={false}
        recordedBlob={null}
        file={file}
        uploadProcessing={false}
        fileInputRef={createRef<HTMLInputElement | null>()}
        onFileSelected={vi.fn()}
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
      />,
    );

    const ticking = view.container.querySelector(".musai-capture-import--tick");
    expect(view.container.querySelector(".musai-import-tick")).toBeTruthy();
    expect(ticking?.textContent).toContain("clean.m4a");
    expect(ticking?.textContent).toContain("Ready");

    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(view.container.querySelector(".musai-import-tick")).toBeNull();
    expect(view.container.querySelector(".musai-capture-import--tick")).toBeNull();
    expect(screen.getByText("clean.m4a")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    expect(view.container.querySelector(".musai-import-tick")).toBeNull();

    vi.useRealTimers();
  });
});
