import { describe, expect, it } from "vitest";
import { midiToHz } from "@/lib/intonation";
import { getInstrument } from "@/lib/instrument";
import {
  advanceTunerHold,
  identifyTunerPitch,
  IN_TUNE_HOLD_MS,
  pruneTunedToInstrument,
  revealedSlots,
  tunerCentsLabel,
  tunerCueCopy,
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

  it("keeps a clearly flat A on A instead of renaming it G♯", () => {
    const flat = 440 * Math.pow(2, -70 / 1200);
    const r = identifyTunerPitch(flat);
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.pitchClassName).toBe("A");
    expect(r!.direction).toBe("low");
    expect(r!.cents).toBeLessThan(-50);
  });

  it("stays on the previous string through a wobble toward the next note", () => {
    const wobble = 440 * Math.pow(2, -90 / 1200);
    const r = identifyTunerPitch(wobble, "A");
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.direction).toBe("low");
  });

  it("marks a clearly sharp A as a miss", () => {
    const sharp = 440 * Math.pow(2, 40 / 1200);
    const r = identifyTunerPitch(sharp);
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("A");
    expect(r!.direction).toBe("high");
    expect(r!.tone).toBe("bad");
  });

  it("does not treat C3 as an open string on violin", () => {
    const r = identifyTunerPitch(midiToHz(48), null, getInstrument("violin"));
    expect(r).not.toBeNull();
    expect(r!.stringId).not.toBe("C");
  });

  it("hears C3 as C on viola", () => {
    const r = identifyTunerPitch(midiToHz(48), null, getInstrument("viola"));
    expect(r).not.toBeNull();
    expect(r!.stringId).toBe("C");
    expect(r!.targetLabel).toBe("C3");
    expect(r!.direction).toBe("in_tune");
  });

  it("does not treat C4 as an open C on violin", () => {
    const r = identifyTunerPitch(midiToHz(60), null, getInstrument("violin"));
    expect(r).not.toBeNull();
    expect(r!.stringId).not.toBe("C");
  });

  it("keeps G, D, and A on viola", () => {
    const viola = getInstrument("viola");
    expect(identifyTunerPitch(midiToHz(55), null, viola)!.stringId).toBe("G");
    expect(identifyTunerPitch(440, null, viola)!.stringId).toBe("A");
    expect(identifyTunerPitch(midiToHz(62), null, viola)!.stringId).toBe("D");
  });
});

describe("pruneTunedToInstrument", () => {
  it("drops E when moving to viola and keeps shared strings", () => {
    const pruned = pruneTunedToInstrument(
      new Set(["G", "D", "E"]),
      getInstrument("viola"),
    );
    expect([...pruned]).toEqual(["G", "D"]);
  });
});

describe("revealedSlots", () => {
  it("starts with four empty positions", () => {
    expect(revealedSlots(getInstrument("violin"), new Set())).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("puts D in the second violin slot even if G has not been heard", () => {
    expect(revealedSlots(getInstrument("violin"), new Set(["D"]))).toEqual([
      null,
      "D",
      null,
      null,
    ]);
  });

  it("puts A in the third violin slot when played first", () => {
    expect(revealedSlots(getInstrument("violin"), new Set(["A"]))).toEqual([
      null,
      null,
      "A",
      null,
    ]);
  });

  it("fills violin slots in layout order, not play order", () => {
    expect(revealedSlots(getInstrument("violin"), new Set(["E", "G"]))).toEqual([
      "G",
      null,
      null,
      "E",
    ]);
  });

  it("places C on the left of the viola layout", () => {
    expect(
      revealedSlots(getInstrument("viola"), new Set(["C", "G", "D"])),
    ).toEqual(["C", "G", "D", null]);
  });

  it("moves G to the second slot on viola", () => {
    expect(revealedSlots(getInstrument("viola"), new Set(["G"]))).toEqual([
      null,
      "G",
      null,
      null,
    ]);
  });
});

describe("piano chromatic tuner", () => {
  const piano = getInstrument("piano");

  it("names the nearest note instead of an open string", () => {
    const a = identifyTunerPitch(440, null, piano);
    expect(a?.stringId).toBeNull();
    expect(a?.targetLabel).toBe("A4");
    expect(a?.direction).toBe("in_tune");
    const c = identifyTunerPitch(midiToHz(60), null, piano);
    expect(c?.targetLabel).toBe("C4");
    expect(c?.direction).toBe("in_tune");
  });

  it("asks for a note while waiting", () => {
    expect(tunerCueCopy(null, piano).headline).toBe("Play a note");
  });
});

describe("tunerCentsLabel", () => {
  it("says how far the note is without a cent count", () => {
    expect(tunerCentsLabel(null)).toBe("");
    expect(tunerCentsLabel(identifyTunerPitch(440))).toBe("In tune");
    expect(
      tunerCentsLabel(identifyTunerPitch(440 * Math.pow(2, -20 / 1200))),
    ).toBe("A little flat");
    expect(
      tunerCentsLabel(identifyTunerPitch(440 * Math.pow(2, 22 / 1200))),
    ).toBe("A little sharp");
    expect(
      tunerCentsLabel(identifyTunerPitch(440 * Math.pow(2, 38 / 1200))),
    ).toBe("Sharp");
    expect(
      tunerCentsLabel(identifyTunerPitch(440 * Math.pow(2, -46 / 1200))),
    ).toBe("Very flat");
    expect(
      tunerCentsLabel(identifyTunerPitch(440 * Math.pow(2, 46 / 1200))),
    ).toBe("Very sharp");
  });
});

describe("tunerCueCopy", () => {
  it("stays quiet while waiting for a string", () => {
    expect(tunerCueCopy(null)).toEqual({
      headline: "Play a string",
      hint: "",
    });
  });

  it("names a low string without extra instruction", () => {
    const r = identifyTunerPitch(440 * Math.pow(2, -22 / 1200));
    expect(tunerCueCopy(r)).toEqual({
      headline: "Too low",
      hint: "",
    });
  });

  it("names a high string without extra instruction", () => {
    const r = identifyTunerPitch(440 * Math.pow(2, 22 / 1200));
    expect(tunerCueCopy(r)).toEqual({
      headline: "Too high",
      hint: "",
    });
  });
});

function inTuneA(): TunerReading {
  return identifyTunerPitch(440)!;
}

describe("advanceTunerHold", () => {
  const empty = new Set<never>();

  it("does not lock on a quick swipe through the pitch", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const swipe = advanceTunerHold(first.hold, inTuneA(), 250, empty);
    expect(swipe.lock).toBeNull();
    expect(swipe.progress).toBeLessThan(0.4);
  });

  it("locks after about a second of a steady in-tune note", () => {
    expect(IN_TUNE_HOLD_MS).toBe(1000);
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const almost = advanceTunerHold(
      first.hold,
      inTuneA(),
      IN_TUNE_HOLD_MS - 1,
      empty,
    );
    expect(almost.lock).toBeNull();
    expect(almost.progress).toBeLessThan(1);
    const done = advanceTunerHold(first.hold, inTuneA(), IN_TUNE_HOLD_MS, empty);
    expect(done.lock).toBe("A");
    expect(done.progress).toBe(1);
  });

  it("uses the same one-second hold for a viola string", () => {
    const c = identifyTunerPitch(midiToHz(48), null, getInstrument("viola"))!;
    expect(c.direction).toBe("in_tune");
    expect(c.stringId).toBe("C");
    const first = advanceTunerHold(null, c, 0, empty);
    const swipe = advanceTunerHold(first.hold, c, 250, empty);
    expect(swipe.lock).toBeNull();
    const done = advanceTunerHold(first.hold, c, IN_TUNE_HOLD_MS, empty);
    expect(done.lock).toBe("C");
  });

  it("resets when the pitch goes sharp", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 600, empty);
    expect(held.lock).toBeNull();
    const sharp = identifyTunerPitch(440 * Math.pow(2, 22 / 1200));
    const reset = advanceTunerHold(held.hold, sharp, 650, empty);
    expect(reset.hold).toBeNull();
    expect(reset.lock).toBeNull();
    expect(reset.progress).toBe(0);
  });

  it("keeps the hold across a short silent dropout", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 700, empty);
    expect(held.lock).toBeNull();
    const dropout = advanceTunerHold(held.hold, null, 820, empty);
    expect(dropout.hold?.stringId).toBe("A");
    const resumed = advanceTunerHold(dropout.hold, inTuneA(), 900, empty);
    expect(resumed.hold?.stringId).toBe("A");
    expect(resumed.progress).toBeGreaterThan(0.5);
  });

  it("resets when a non-string pitch is heard", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 700, empty);
    expect(held.lock).toBeNull();
    const f = identifyTunerPitch(midiToHz(65));
    const reset = advanceTunerHold(held.hold, f, 750, empty);
    expect(reset.hold).toBeNull();
    expect(reset.progress).toBe(0);
  });

  it("starts over when a different string is played", () => {
    const first = advanceTunerHold(null, inTuneA(), 0, empty);
    const held = advanceTunerHold(first.hold, inTuneA(), 700, empty);
    expect(held.lock).toBeNull();
    const g = identifyTunerPitch(midiToHz(55));
    const switched = advanceTunerHold(held.hold, g, 750, empty);
    expect(switched.hold?.stringId).toBe("G");
    expect(switched.progress).toBe(0);
    expect(switched.lock).toBeNull();
  });
});
