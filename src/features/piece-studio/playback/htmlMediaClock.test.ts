import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHtmlMediaClock,
  seekHtmlMedia,
} from "@/features/piece-studio/playback/htmlMediaClock";

function makeMedia(paused = true, duration = 8): HTMLAudioElement {
  const el = document.createElement("audio");
  Object.defineProperty(el, "paused", { value: paused, writable: true });
  Object.defineProperty(el, "ended", { value: false, writable: true });
  Object.defineProperty(el, "duration", { value: duration, writable: true });
  el.currentTime = 0;
  return el;
}

describe("htmlMediaClock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps media time onto score time for last-take replay", () => {
    const media = makeMedia();
    media.currentTime = 4;
    const clock = createHtmlMediaClock(media, (audio, dur) =>
      dur > 0 ? (audio / dur) * 10 : audio,
    );
    expect(clock.getCurrentSec()).toBeCloseTo(5);
    clock.dispose();
  });

  it("publishes currentTime to playhead listeners", () => {
    const media = makeMedia();
    media.currentTime = 1.25;
    const clock = createHtmlMediaClock(media);
    const seen: number[] = [];
    const unsub = clock.subscribeTime((t) => seen.push(t));
    expect(clock.getCurrentSec()).toBeCloseTo(1.25);
    expect(seen[0]).toBeCloseTo(1.25);
    unsub();
    clock.dispose();
  });

  it("seeks within the clip so a selected section starts on time", () => {
    const media = makeMedia();
    seekHtmlMedia(media, 2.5);
    expect(media.currentTime).toBeCloseTo(2.5);
    seekHtmlMedia(media, 99);
    expect(media.currentTime).toBeCloseTo(8);
    seekHtmlMedia(media, -1);
    expect(media.currentTime).toBe(0);
  });

  it("does not seek before the clip has a duration", () => {
    const media = makeMedia(true, Number.NaN);
    seekHtmlMedia(media, 2.5);
    expect(media.currentTime).toBe(0);
  });
});
