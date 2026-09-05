import { describe, expect, it } from "vitest";
import { midiToHz } from "@/lib/intonation";
import { identifyTunerPitch } from "@/lib/violinTuner";

describe("identifyTunerPitch", () => {
  it("hears A4 as in-tune A", () => {
    const r = identifyTunerPitch(440);
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.targetLabel).toBe("A4");
    expect(r!.tone).toBe("good");
    expect(r!.score).toBe(100);
    expect(Math.abs(r!.cents)).toBeLessThan(1);
  });

  it("treats A5 as A, not wildly sharp of A4", () => {
    const r = identifyTunerPitch(midiToHz(81));
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.targetLabel).toBe("A5");
    expect(r!.tone).toBe("good");
    expect(r!.score).toBe(100);
  });

  it("hears G3 as G", () => {
    const r = identifyTunerPitch(midiToHz(55));
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("G");
    expect(r!.targetLabel).toBe("G3");
    expect(r!.direction).toBe("in_tune");
  });

  it("marks a clearly sharp A as too high", () => {
    const sharp = 440 * Math.pow(2, 40 / 1200);
    const r = identifyTunerPitch(sharp);
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.direction).toBe("high");
    expect(r!.tone).toBe("slight");
  });
});
