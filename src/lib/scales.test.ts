import { describe, expect, it } from "vitest";
import {
  accidentalBadge,
  accidentalMarks,
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  scaleIdFor,
  scaleDisplayLabel,
  tonicAccidentalRows,
  validateScaleMidisInViolinRange,
} from "@/lib/scales";

describe("buildAscendingScaleMidis", () => {
  it("builds 8 notes for one octave G major from G3", () => {
    const midis = buildAscendingScaleMidis(55, "major", 1);
    expect(midis).toHaveLength(8);
    expect(midis).toEqual([55, 57, 59, 60, 62, 64, 66, 67]);
  });

  it("builds 15 notes for two octaves G major from G3", () => {
    const midis = buildAscendingScaleMidis(55, "major", 2);
    expect(midis).toHaveLength(15);
    expect(midis[0]).toBe(55);
    expect(midis.at(-1)).toBe(79);
  });

  it("natural minor pattern differs on 3rd", () => {
    const major = buildAscendingScaleMidis(60, "major", 1);
    const minor = buildAscendingScaleMidis(60, "natural_minor", 1);
    expect(major[2]).toBe(64);
    expect(minor[2]).toBe(63);
  });
});

describe("scaleIdFor", () => {
  it("returns stable id", () => {
    expect(scaleIdFor(7, "major")).toBe("G_major");
    expect(scaleIdFor(0, "natural_minor")).toBe("C_natural_minor");
  });
});

describe("validateScaleMidisInViolinRange", () => {
  it("accepts typical G major one octave from G3", () => {
    expect(
      validateScaleMidisInViolinRange(buildAscendingScaleMidis(55, "major", 1)),
    ).toBe(true);
  });
});

describe("tonicAccidentalRows", () => {
  it("starts major at C, then F/G for one accidental", () => {
    const rows = tonicAccidentalRows("major");
    expect(rows[0]!.keys.map((k) => k.label)).toEqual(["C"]);
    expect(rows[1]!.keys.map((k) => k.label)).toEqual(["F", "G"]);
    expect(accidentalBadge(rows[0]!.keys[0]!)).toBe("natural");
    expect(accidentalBadge(rows[1]!.keys[0]!)).toBe("1 flat");
    expect(accidentalBadge(rows[1]!.keys[1]!)).toBe("1 sharp");
    expect(accidentalMarks(rows[1]!.keys[0]!)).toBe("♭");
    expect(accidentalMarks(rows[1]!.keys[1]!)).toBe("♯");
    expect(accidentalMarks(rows[2]!.keys[0]!)).toBe("♭♭");
    expect(rows.flatMap((r) => r.keys).map((k) => k.pitchClass).sort((a, b) => a - b)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
  });

  it("starts minor at A, then D/E for one accidental", () => {
    const rows = tonicAccidentalRows("natural_minor");
    expect(rows[0]!.keys.map((k) => k.label)).toEqual(["A"]);
    expect(rows[1]!.keys.map((k) => k.label)).toEqual(["D", "E"]);
  });
});

describe("scaleDisplayLabel", () => {
  it("uses sidebar spellings for sharp and flat minors", () => {
    expect(scaleDisplayLabel(8, "natural_minor")).toBe("G♯ natural minor");
    expect(scaleDisplayLabel(3, "natural_minor")).toBe("E♭ natural minor");
  });
});

describe("buildExerciseScaleMidis", () => {
  it("adds descending leg without duplicating peak", () => {
    const ex = buildExerciseScaleMidis(55, "major", 1);
    expect(ex).toHaveLength(15);
    expect(ex[0]).toBe(55);
    expect(ex[7]).toBe(67);
    expect(ex[8]).toBe(66);
    expect(ex.at(-1)).toBe(55);
  });
});
