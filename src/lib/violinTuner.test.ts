import { describe, expect, it } from "vitest";
import { midiToHz } from "@/lib/intonation";
import {
  advanceTunerHold,
  identifyTunerPitch,
  IN_TUNE_HOLD_MS,
  type TunerReading,
} from "@/lib/violinTuner";

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

  it("marks a slightly sharp A as too high, not in tune", () => {
    const sharp = 440 * Math.pow(2, 22 / 1200);
    const r = identifyTunerPitch(sharp);
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.direction).toBe("high");
    expect(r!.tone).toBe("slight");
  });

  it("marks a clearly sharp A as a miss", () => {
    const sharp = 440 * Math.pow(2, 40 / 1200);
    const r = identifyTunerPitch(sharp);
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.direction).toBe("high");
    expect(r!.tone).toBe("bad");
  });
});

function inTuneA(): TunerReading {
  return identifyTunerPitch(440)!;
}

describe("advanceTunerHold", () => {
  const empty = new Set<never>();

  it("does not lock after a brief in-tune blip", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const second = advanceTunerHold(first.hold, inTuneA(), 200, empty);
    expect(second.lock).toBeNull();
    expect(second.progress).toBeLessThan(1);
  });

  it("locks only after the string is held in tune long enough", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const done = advanceTunerHold(
      first.hold,
      inTuneA(),
      IN_TUNE_HOLD_MS,
      empty,
    );
    expect(done.lock).toBe("A");
    expect(done.progress).toBe(1);
  });

  it("resets when the pitch goes sharp", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 1200, empty);
    const sharp = identifyTunerPitch(440 * Math.pow(2, 22 / 1200));
    const reset = advanceTunerHold(held.hold, sharp, 1250, empty);
    expect(reset.hold).toBeNull();
    expect(reset.lock).toBeNull();
    expect(reset.progress).toBe(0);
  });

  it("keeps the hold across a short silent dropout", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 900, empty);
    const dropout = advanceTunerHold(held.hold, null, 1020, empty);
    expect(dropout.hold?.stringId).toBe("A");
    const resumed = advanceTunerHold(dropout.hold, inTuneA(), 1100, empty);
    expect(resumed.hold?.stringId).toBe("A");
    expect(resumed.progress).toBeGreaterThan(0.5);
  });

  it("resets when a non-string pitch is heard", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 900, empty);
    const f = identifyTunerPitch(midiToHz(65));
    const reset = advanceTunerHold(held.hold, f, 950, empty);
    expect(reset.hold).toBeNull();
    expect(reset.progress).toBe(0);
  });

  it("starts over when a different string is played", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 1000, empty);
    const g = identifyTunerPitch(midiToHz(55));
    const switched = advanceTunerHold(held.hold, g, 1050, empty);
    expect(switched.hold?.stringId).toBe("G");
    expect(switched.progress).toBe(0);
    expect(switched.lock).toBeNull();
  });
});
