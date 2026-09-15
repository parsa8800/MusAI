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
  speedPreset: "normal" as const,
  metronomeOn: false,
  loop: null,
  measureCount: 4,
  unavailable: null,
  onToggle: vi.fn(),
  onRestart: vi.fn(),
  onSeek: vi.fn(),
  onBpm: vi.fn(),
  onSpeedPreset: vi.fn(),
  onToggleMetronome: vi.fn(),
  onLoopChange: vi.fn(),
  onLoopCurrentMeasure: vi.fn(),
  onSeekToMeasure: vi.fn(),
};

describe("PieceListenControls", () => {
  it("defaults to play / restart / seek / clock with advanced tools behind More", async () => {
    const onToggle = vi.fn();
    const onRestart = vi.fn();
    const onSeek = vi.fn();
    const onScrubPreview = vi.fn();
    const onSpeedPreset = vi.fn();
    const onToggleMetronome = vi.fn();
    const { rerender } = render(
      <PieceListenControls
        {...baseProps}
        onToggle={onToggle}
        onRestart={onRestart}
        onSeek={onSeek}
        onScrubPreview={onScrubPreview}
        onSpeedPreset={onSpeedPreset}
        onToggleMetronome={onToggleMetronome}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart from beginning" }));
    expect(onToggle).toHaveBeenCalled();
    expect(onRestart).toHaveBeenCalled();
    expect(screen.getByTestId("piece-listen-seek")).toBeInTheDocument();
    expect(screen.getByTestId("piece-listen-time-current")).toHaveTextContent(/0:01/);
    expect(screen.getByTestId("piece-listen-time-total")).toHaveTextContent(/0:04/);
    expect(
      screen.getByRole("button", { name: "Playback options" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("piece-listen-options")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "½" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Speed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tap a bar/i)).not.toBeInTheDocument();

    const seek = screen.getByTestId("piece-listen-seek");
    fireEvent.pointerDown(seek);
    fireEvent.change(seek, { target: { value: "2.5" } });
    expect(onSeek).not.toHaveBeenCalled();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(onScrubPreview).toHaveBeenCalledWith(2.5);
    expect(onSeek).not.toHaveBeenCalled();
    fireEvent.blur(seek);
    expect(onSeek).toHaveBeenCalledWith(2.5);

    fireEvent.click(screen.getByRole("button", { name: "Playback options" }));
    expect(screen.getByTestId("piece-listen-options")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "½" }));
    fireEvent.click(screen.getByTestId("piece-listen-metronome"));
    expect(onSpeedPreset).toHaveBeenCalledWith("slow");
    expect(onToggleMetronome).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Playback options" }));
    expect(screen.queryByTestId("piece-listen-options")).not.toBeInTheDocument();

    rerender(
      <PieceListenControls
        {...baseProps}
        playing
        onToggle={onToggle}
        onRestart={onRestart}
        onSeek={onSeek}
        onScrubPreview={onScrubPreview}
        onSpeedPreset={onSpeedPreset}
        onToggleMetronome={onToggleMetronome}
      />,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});
