import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceListenControls } from "@/features/piece-studio/playback/PieceListenControls";

const baseProps = {
  ready: true,
  playing: false,
  currentSec: 1.2,
  durationSec: 4.8,
  bpm: 100,
  baseBpm: 100,
  speedPreset: "written" as const,
  metronomeOn: false,
  loop: null,
  measureCount: 4,
  unavailable: null,
  onToggle: vi.fn(),
  onPause: vi.fn(),
  onRestart: vi.fn(),
  onBpm: vi.fn(),
  onSpeedPreset: vi.fn(),
  onToggleMetronome: vi.fn(),
  onLoopPress: vi.fn(),
  loopPick: null,
};

describe("PieceListenControls", () => {
  it("keeps a compact play dock without a scrubber; options pause playback", () => {
    const onToggle = vi.fn();
    const onPause = vi.fn();
    const onRestart = vi.fn();
    const onSpeedPreset = vi.fn();
    const onToggleMetronome = vi.fn();
    const onBpm = vi.fn();
    const { rerender } = render(
      <PieceListenControls
        {...baseProps}
        onToggle={onToggle}
        onPause={onPause}
        onRestart={onRestart}
        onSpeedPreset={onSpeedPreset}
        onToggleMetronome={onToggleMetronome}
        onBpm={onBpm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart from beginning" }));
    expect(onToggle).toHaveBeenCalled();
    expect(onRestart).toHaveBeenCalled();
    expect(screen.queryByTestId("piece-listen-seek")).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-listen-time-current")).toHaveTextContent(/0:01/);
    expect(screen.getByTestId("piece-listen-time-total")).toHaveTextContent(/0:04/);
    expect(
      screen.getByRole("button", { name: "Playback options" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("piece-listen-options")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Playback options" }));
    const options = screen.getByTestId("piece-listen-options");
    expect(options).toBeInTheDocument();
    expect(options.closest(".musai-piece-listen")).not.toBeNull();
    expect(options.querySelector(".musai-piece-listen__hint")).toBeNull();
    expect(onPause).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Piano" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Violin" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Half tempo" }));
    fireEvent.click(screen.getByTestId("piece-listen-metronome"));
    expect(onSpeedPreset).toHaveBeenCalledWith("half");
    expect(onToggleMetronome).toHaveBeenCalled();

    const tempo = screen.getByRole("slider", { name: /Tempo/ });
    expect(tempo).toHaveAttribute("min", "20");
    expect(tempo).toHaveAttribute("max", "320");
    fireEvent.pointerDown(tempo);
    fireEvent.change(tempo, { target: { value: "20" } });
    expect(onBpm).not.toHaveBeenCalled();
    fireEvent.pointerUp(tempo);
    expect(onBpm).toHaveBeenCalledWith(20);

    fireEvent.click(screen.getByRole("button", { name: "Playback options" }));
    expect(screen.queryByTestId("piece-listen-options")).toBeNull();

    rerender(
      <PieceListenControls
        {...baseProps}
        playing
        onToggle={onToggle}
        onPause={onPause}
        onRestart={onRestart}
        onSpeedPreset={onSpeedPreset}
        onToggleMetronome={onToggleMetronome}
        onBpm={onBpm}
      />,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Playback options" }));
    expect(onPause).toHaveBeenCalled();
    expect(screen.getByTestId("piece-listen-options")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("piece-listen-options")).toBeNull();
  });

  it("shows a click volume slider only while the metronome is on", () => {
    const onClickLevel = vi.fn();
    const onPreviewClick = vi.fn();
    const { rerender } = render(
      <PieceListenControls
        {...baseProps}
        onClickLevel={onClickLevel}
        onPreviewClick={onPreviewClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Playback options" }));
    expect(screen.queryByRole("slider", { name: /Click volume/ })).toBeNull();

    rerender(
      <PieceListenControls
        {...baseProps}
        metronomeOn
        clickLevel={72}
        onClickLevel={onClickLevel}
        onPreviewClick={onPreviewClick}
      />,
    );
    const volume = screen.getByRole("slider", { name: "Click volume 72" });
    expect(volume).toHaveAttribute("min", "0");
    expect(volume).toHaveAttribute("max", "100");
    fireEvent.change(volume, { target: { value: "40" } });
    expect(onClickLevel).toHaveBeenCalledWith(40);
    fireEvent.pointerUp(volume);
    expect(onPreviewClick).toHaveBeenCalled();
  });
});
