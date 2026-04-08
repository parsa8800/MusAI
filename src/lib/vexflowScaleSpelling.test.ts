import { describe, expect, it } from "vitest";
import {
  letterAndMidiToVexKey,
  spellAscendingMidisToVexKeys,
  vexKeySignatureSpec,
} from "@/lib/vexflowScaleSpelling";
import { buildAscendingScaleMidis } from "@/lib/scales";

describe("vexKeySignatureSpec", () => {
  it("uses major key for major scales", () => {
    expect(vexKeySignatureSpec(7, "major")).toBe("G");
    expect(vexKeySignatureSpec(0, "major")).toBe("C");
  });

  it("uses relative major for natural minor", () => {
    expect(vexKeySignatureSpec(9, "natural_minor")).toBe("C");
    expect(vexKeySignatureSpec(7, "natural_minor")).toBe("Bb");
  });
});

describe("spellAscendingMidisToVexKeys", () => {
  it("spells G major one octave from G3", () => {
    const midis = buildAscendingScaleMidis(55, "major", 1);
    const keys = spellAscendingMidisToVexKeys(midis, 7, "major");
    expect(keys).toEqual([
      "g/3",
      "a/3",
      "b/3",
      "c/4",
      "d/4",
      "e/4",
      "f#/4",
      "g/4",
    ]);
  });

  it("spells Bb natural minor with Db on degree three", () => {
    const midis = buildAscendingScaleMidis(58, "natural_minor", 1);
    const keys = spellAscendingMidisToVexKeys(midis, 10, "natural_minor");
    expect(keys[0]).toBe("bb/3");
    expect(keys[2]).toBe("db/4");
  });
});

describe("letterAndMidiToVexKey", () => {
  it("uses correct octave for middle C", () => {
    expect(letterAndMidiToVexKey("C", 60)).toBe("c/4");
  });
});
