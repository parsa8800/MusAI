import { describe, expect, it } from "vitest";
import {
  accidentalBadge,
  accidentalCountLabel,
  accidentalMarks,
  accidentalNames,
  buildAscendingScaleMidis,
  buildExerciseScaleMidis,
  buildScaleExerciseMidis,
  defaultRootMidiForTonic,
  expectedScaleNoteCount,
  keySignatureSummary,
  preferredTonicOption,
  scaleIdFor,
  scaleDisplayLabel,
  tonicAccidentalRows,
  validateScaleMidisInViolinRange,
  violinRootsForTonic,
} from "@/lib/scales";
import { VIOLIN_MIDI_MAX, VIOLIN_MIDI_MIN } from "@/lib/intonation";

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
    expect(accidentalBadge(rows[0]!.keys[0]!)).toBe("No sharps or flats");
    expect(accidentalBadge(rows[1]!.keys[0]!)).toBe("1 flat");
    expect(accidentalBadge(rows[1]!.keys[1]!)).toBe("1 sharp");
    expect(accidentalMarks(rows[1]!.keys[0]!)).toBe("♭");
    expect(accidentalMarks(rows[1]!.keys[1]!)).toBe("♯");
    expect(accidentalMarks(rows[2]!.keys[0]!)).toBe("♭♭");
    expect(accidentalCountLabel(rows[0]!.keys[0]!)).toBe("♮");
    expect(accidentalCountLabel(rows[1]!.keys[0]!)).toBe("1♭");
    expect(accidentalCountLabel(rows[2]!.keys[0]!)).toBe("2♭");
    expect(accidentalCountLabel(rows[1]!.keys[1]!)).toBe("1♯");
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

  it("crosses B4 → C5 with MIDI 71 then 72", () => {
    const up = buildScaleExerciseMidis(60, "major", 1, "ascending");
    expect(up[6]).toBe(71);
    expect(up[7]).toBe(72);
  });

  it("descends across the C5 → B4 octave boundary", () => {
    const down = buildScaleExerciseMidis(60, "major", 1, "descending");
    expect(down[0]).toBe(72);
    expect(down[1]).toBe(71);
    expect(down.at(-1)).toBe(60);
  });

  it("2-octave turnaround is a single peak tonic", () => {
    const rt = buildScaleExerciseMidis(60, "major", 2, "up_down");
    expect(rt[14]).toBe(84);
    expect(rt[15]).toBe(83);
    expect(rt.filter((m) => m === 84)).toHaveLength(1);
  });
});

describe("expectedScaleNoteCount follows construction", () => {
  it("updates immediately when octave or direction changes", () => {
    expect(expectedScaleNoteCount(1, "ascending")).not.toBe(
      expectedScaleNoteCount(2, "ascending"),
    );
    expect(expectedScaleNoteCount(1, "ascending")).not.toBe(
      expectedScaleNoteCount(1, "up_down"),
    );
    expect(expectedScaleNoteCount(1, "descending")).toBe(
      expectedScaleNoteCount(1, "ascending"),
    );
    expect(
      buildScaleExerciseMidis(60, "major", 2, "up_down"),
    ).toHaveLength(expectedScaleNoteCount(2, "up_down"));
  });
});

describe("violin range extremes", () => {
  it("lowest supported G string start is G3", () => {
    const roots = violinRootsForTonic(7);
    expect(Math.min(...roots)).toBe(VIOLIN_MIDI_MIN);
    expect(VIOLIN_MIDI_MIN).toBe(55);
    const fromG3 = buildScaleExerciseMidis(55, "major", 2, "ascending");
    expect(fromG3[0]).toBe(55);
    expect(validateScaleMidisInViolinRange(fromG3)).toBe(true);
  });

  it("highest default 2-octave end stays at or below the violin max", () => {
    for (const key of tonicAccidentalRows("major").flatMap((r) => r.keys)) {
      const root = defaultRootMidiForTonic(key.pitchClass);
      const up = buildScaleExerciseMidis(root, "major", 2, "ascending");
      expect(up.at(-1)!).toBeLessThanOrEqual(VIOLIN_MIDI_MAX);
    }
  });
});

describe("keySignatureSummary", () => {
  it("lists major accidentals in printed order", () => {
    const d = keySignatureSummary(preferredTonicOption(2, "major"), "major");
    expect(d.displayName).toBe("D major");
    expect(d.countLabel).toBe("2 sharps");
    expect(d.accidentalNames).toEqual(["F♯", "C♯"]);
    expect(d.matchHint).toBe("Music with 2 sharps");

    const bb = keySignatureSummary(preferredTonicOption(10, "major"), "major");
    expect(bb.displayName).toBe("B♭ major");
    expect(bb.countLabel).toBe("2 flats");
    expect(bb.accidentalNames).toEqual(["B♭", "E♭"]);

    const c = keySignatureSummary(preferredTonicOption(0, "major"), "major");
    expect(c.countLabel).toBe("No sharps or flats");
    expect(c.accidentalNames).toEqual([]);
    expect(c.matchHint).toBe("No accidentals");

    expect(accidentalNames(preferredTonicOption(9, "major"))).toEqual([
      "F♯",
      "C♯",
      "G♯",
    ]);
    expect(accidentalNames(preferredTonicOption(5, "major"))).toEqual(["B♭"]);
  });

  it("uses the same accidental names for the relative minor signature", () => {
    const eMinor = keySignatureSummary(
      preferredTonicOption(4, "natural_minor"),
      "natural_minor",
    );
    expect(eMinor.displayName).toBe("E minor");
    expect(eMinor.accidentalNames).toEqual(["F♯"]);
    expect(eMinor.countLabel).toBe("1 sharp");
  });
});
