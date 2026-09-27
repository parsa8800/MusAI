import { describe, expect, it, vi } from "vitest";
import { silenceScheduledSources } from "@/features/piece-studio/playback/pieceListenCut";

function fakeSource(stop: (when?: number) => void) {
  return {
    disconnect: vi.fn(),
    stop: vi.fn(stop),
  };
}

describe("silenceScheduledSources", () => {
  it("disconnects a note whose stop time is already locked in", () => {
    const source = fakeSource(() => {
      throw new Error("stop time already scheduled");
    });

    silenceScheduledSources([source], 10);

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledWith(10);
    expect(source.stop).toHaveBeenCalledWith(15);
  });

  it("disconnects a note that has not started yet", () => {
    const source = fakeSource((when) => {
      if (when === 10) throw new Error("stop time is earlier than the start time");
    });

    silenceScheduledSources([source], 10);

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenNthCalledWith(1, 10);
    expect(source.stop).toHaveBeenNthCalledWith(2, 15);
  });

  it("stops a sounding note immediately and still disconnects it", () => {
    const source = fakeSource(() => undefined);

    silenceScheduledSources([source], 4);

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledWith(4);
  });

  it("keeps going when one source is already gone", () => {
    const dead = fakeSource(() => {
      throw new Error("gone");
    });
    dead.disconnect.mockImplementation(() => {
      throw new Error("already disconnected");
    });
    const next = fakeSource(() => undefined);

    silenceScheduledSources([dead, next], 1);

    expect(next.disconnect).toHaveBeenCalledOnce();
    expect(next.stop).toHaveBeenCalledWith(1);
  });
});
