import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioContext } from "../audioContext";

describe("createAudioContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when window is undefined (SSR / node)", () => {
    vi.stubGlobal("window", undefined);
    expect(createAudioContext()).toBeNull();
  });

  it("returns null when no AudioContext constructor exists", () => {
    vi.stubGlobal("window", {
      AudioContext: undefined,
      webkitAudioContext: undefined,
    });
    expect(createAudioContext()).toBeNull();
  });
});
