import { describe, expect, it } from "vitest";
import {
  letterAndMidiToVexKey,
  spellAscendingMidisToVexKeys,
  staffStepFromVexKey,
  staveCanvasMetrics,
  vexKeySignatureSpec,
} from "@/lib/vexflowScaleSpelling";
import {
  buildAscendingScaleMidis,
  scaleDisplayLabel,
  violinRootsForTonic,
} from "@/lib/scales";

describe("vexKeySignatureSpec", () => {
  it("uses major key for major scales", () => {
    expect(vexKeySignatureSpec(7, "major")).toBe("G");
    expect(vexKeySignatureSpec(0, "major")).toBe("C");
  });

  it("uses relative major for natural minor", () => {
    expect(vexKeySignatureSpec(9, "natural_minor")).toBe("C");
    expect(vexKeySignatureSpec(7, "natural_minor")).toBe("Bb");
  });

  it("uses Gb for E♭ minor and B for G♯ minor", () => {
    expect(vexKeySignatureSpec(3, "natural_minor")).toBe("Gb");
    expect(vexKeySignatureSpec(8, "natural_minor")).toBe("B");
  });
});

describe("spellAscendingMidisToVexKeys", () => {
  it("spells C major one octave from C4 with no accidental letters needed in keys", () => {
    const midis = buildAscendingScaleMidis(60, "major", 1);
    const keys = spellAscendingMidisToVexKeys(midis, 0, "major");
    expect(vexKeySignatureSpec(0, "major")).toBe("C");
    expect(keys).toEqual([
      "c/4",
      "d/4",
      "e/4",
      "f/4",
      "g/4",
      "a/4",
      "b/4",
      "c/5",
    ]);
  });

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

  it("writes B3 as C♭ on the C4 line, not an octave lower", () => {
    expect(letterAndMidiToVexKey("C", 59)).toBe("cb/4");
  });

  it("writes C4 as B♯ on the B3 line", () => {
    expect(letterAndMidiToVexKey("B", 60)).toBe("b#/3");
  });
});

describe("high-accidental minor spellings", () => {
  it("spells G♯ minor as G♯ A♯ B… with no C♭ dip", () => {
    expect(scaleDisplayLabel(8, "natural_minor")).toBe("G♯ natural minor");
    const midis = buildAscendingScaleMidis(56, "natural_minor", 1);
    const keys = spellAscendingMidisToVexKeys(midis, 8, "natural_minor");
    expect(keys).toEqual([
      "g#/3",
      "a#/3",
      "b/3",
      "c#/4",
      "d#/4",
      "e/4",
      "f#/4",
      "g#/4",
    ]);
  });

  it("spells E♭ minor with C♭ in the correct octave", () => {
    const midis = buildAscendingScaleMidis(63, "natural_minor", 1);
    const keys = spellAscendingMidisToVexKeys(midis, 3, "natural_minor");
    expect(keys).toEqual([
      "eb/4",
      "f/4",
      "gb/4",
      "ab/4",
      "bb/4",
      "cb/5",
      "db/5",
      "eb/5",
    ]);
  });

  it("keeps every major and minor scale strictly rising on the staff", () => {
    const kinds = ["major", "natural_minor"] as const;
    for (const kind of kinds) {
      for (let pc = 0; pc < 12; pc++) {
        for (const span of [1, 2] as const) {
          const roots = violinRootsForTonic(pc);
          for (const root of roots) {
            const midis = buildAscendingScaleMidis(root, kind, span);
            const keys = spellAscendingMidisToVexKeys(midis, pc, kind);
            const steps = keys.map(staffStepFromVexKey);
            for (let i = 1; i < steps.length; i++) {
              expect(
                steps[i],
                `${kind} pc=${pc} root=${root} span=${span} dip at ${keys[i - 1]} → ${keys[i]}`,
              ).toBeGreaterThan(steps[i - 1]!);
            }
          }
        }
      }
    }
  });
});

describe("staveCanvasMetrics", () => {
  it("keeps a compact box for notes on the stave", () => {
    const mid = staveCanvasMetrics(["d/4", "e/4", "f#/4", "g/4", "a/4", "b/4", "c#/5", "d/5"]);
    expect(mid.height).toBeLessThan(185);
    expect(mid.staveY).toBeLessThan(50);
  });

  it("grows only when notes sit on high ledger lines", () => {
    const mid = staveCanvasMetrics(["c/4", "d/4", "e/4"]);
    const high = staveCanvasMetrics(["c/7", "d/7", "e/7"]);
    expect(high.height).toBeGreaterThan(mid.height + 40);
    expect(high.staveY).toBeGreaterThan(mid.staveY);
  });

  it("adds room below low ledger notes instead of a tall empty band above the staff", () => {
    const mid = staveCanvasMetrics(["d/4", "e/4", "f/4", "g/4"]);
    const low = staveCanvasMetrics(["eb/3", "f/3", "g/3", "ab/3", "bb/3", "c/4", "d/4", "eb/4"]);
    expect(low.staveY).toBeLessThanOrEqual(mid.staveY + 8);
    expect(low.height).toBeGreaterThan(mid.height + 20);
  });
});
