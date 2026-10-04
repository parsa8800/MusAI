import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { PieceTakeReplay } from "@/features/piece-studio/practice/PieceTakeReplay";

describe("PieceTakeReplay", () => {
  it("plays the last take from the start instead of showing a native audio bar", async () => {
    const audioRef = createRef<HTMLAudioElement>();
    const play = vi.fn().mockResolvedValue(undefined);
    render(
      <PieceTakeReplay
        src="blob:take"
        durationSec={8}
        takeNumber={3}
        audioRef={audioRef}
      />,
    );
    const audio = screen.getByTestId("piece-practise-take-audio");
    expect(audio).toHaveAttribute("src", "blob:take");
    expect(audio).not.toHaveAttribute("controls");
    Object.defineProperty(audio, "play", { value: play });
    Object.defineProperty(audio, "pause", { value: vi.fn() });
    Object.defineProperty(audio, "paused", { value: true, writable: true });
    Object.defineProperty(audio, "ended", { value: false, writable: true });

    expect(screen.getByText("Last take")).toBeInTheDocument();
    expect(screen.queryByText("Hear this recording")).not.toBeInTheDocument();
    expect(screen.queryByText("0:00 / 0:08")).not.toBeInTheDocument();
    expect(screen.queryByText("0:00 / 0:00")).not.toBeInTheDocument();
    expect(screen.queryByText(/^0:00$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play last take" }));
    expect(play).toHaveBeenCalled();
  });
});
