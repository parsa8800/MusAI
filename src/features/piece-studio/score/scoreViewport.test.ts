import { describe, expect, it, vi } from "vitest";
import {
  canPaintScoreViewport,
  MIN_SCORE_VIEWPORT_WIDTH_PX,
  readScoreViewportSize,
  waitForScoreViewport,
} from "@/features/piece-studio/score/scoreViewport";

describe("scoreViewport", () => {
  it("rejects zero-width paint targets", () => {
    expect(canPaintScoreViewport(0)).toBe(false);
    expect(canPaintScoreViewport(MIN_SCORE_VIEWPORT_WIDTH_PX - 1)).toBe(false);
    expect(canPaintScoreViewport(MIN_SCORE_VIEWPORT_WIDTH_PX)).toBe(true);
  });

  it("reads clientWidth preferentially", () => {
    const el = {
      clientWidth: 320,
      clientHeight: 180,
      getBoundingClientRect: () => ({ width: 10, height: 10 }),
    } as unknown as HTMLElement;
    expect(readScoreViewportSize(el)).toEqual({ width: 320, height: 180 });
  });

  it("waitForScoreViewport resolves once width is usable", async () => {
    let width = 0;
    const el = {
      get clientWidth() {
        return width;
      },
      clientHeight: 200,
      getBoundingClientRect: () => ({ width, height: 200 }),
    } as unknown as HTMLElement;

    const roCallbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          roCallbacks.push(cb);
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );

    const pending = waitForScoreViewport(el, { maxFrames: 5 });
    width = 400;
    roCallbacks[0]?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
    const size = await pending;
    expect(size.width).toBe(400);
    vi.unstubAllGlobals();
  });
});
