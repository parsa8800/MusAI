import { describe, expect, it } from "vitest";
import {
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  scaleIdFor,
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
