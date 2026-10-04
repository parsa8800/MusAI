import { describe, expect, it } from "vitest";
import {
  nearestViolinRoot,
  violinNoteMidi,
  violinReleaseDelay,
  VIOLIN_ATTACK_SEC,
  VIOLIN_RELEASE_SEC,
} from "@/features/piece-studio/playback/violinPlayback";

describe("violin listen playback", () => {
  it("maps sample names onto MIDI", () => {
    expect(violinNoteMidi("G3")).toBe(55);
    expect(violinNoteMidi("A4")).toBe(69);
    expect(violinNoteMidi("C7")).toBe(96);
  });

  it("picks the closest recording for notes between samples", () => {
    const roots = [55, 57, 60, 69];
    expect(nearestViolinRoot(56, roots)).toBe(55);
    expect(nearestViolinRoot(58, roots)).toBe(57);
    expect(nearestViolinRoot(64, roots)).toBe(60);
  });

  it("gives short notes a fade instead of a hard cut", () => {
    const delay = violinReleaseDelay(0.08);
    expect(delay).toBeGreaterThan(VIOLIN_ATTACK_SEC);
    expect(delay + VIOLIN_RELEASE_SEC).toBeGreaterThan(0.08);
  });
});
