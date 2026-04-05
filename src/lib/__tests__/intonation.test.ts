import { describe, expect, it } from "vitest";
import {
  VIOLIN_MIDI_MAX,
  VIOLIN_MIDI_MIN,
  centsFromTarget,
  formatNoteLabel,
  intonationLabel,
  intonationScore,
  isViolinRangeMidi,
  midiForChromaticCircleStep,
  midiFromOctavePitch,
  midiToHz,
  nearestViolinMidiInOctave,
  nearestViolinMidiWithPitchClass,
  pitchClassLabel,
  scoreAccentColor,
  splitMidi,
  validPitchClassesInOctave,
  verdictSummary,
  violinChromaticNeighborMidi,
  violinNoteOptions,
  violinOctaveBounds,
} from "../intonation";

describe("midiToHz", () => {
  it("maps A4 to 440 Hz", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
  });

  it("maps C4 to ~261.63 Hz", () => {
    expect(midiToHz(60)).toBeCloseTo(261.625565, 3);
  });
});

describe("formatNoteLabel", () => {
  it("formats middle C", () => {
    expect(formatNoteLabel(60)).toBe("C4");
  });

  it("handles negative MIDI (floor division for octave)", () => {
    expect(formatNoteLabel(-1)).toBe("B-2");
  });
});

describe("splitMidi", () => {
  it("splits C7", () => {
    expect(splitMidi(96)).toEqual({ octave: 7, pitchClass: 0 });
  });

  it("splits B6", () => {
    expect(splitMidi(95)).toEqual({ octave: 6, pitchClass: 11 });
  });
});

describe("violin range", () => {
  it("bounds G3 and E7", () => {
    expect(VIOLIN_MIDI_MIN).toBe(55);
    expect(VIOLIN_MIDI_MAX).toBe(100);
    expect(isViolinRangeMidi(54)).toBe(false);
    expect(isViolinRangeMidi(55)).toBe(true);
    expect(isViolinRangeMidi(100)).toBe(true);
    expect(isViolinRangeMidi(101)).toBe(false);
  });

  it("violinOctaveBounds matches split", () => {
    const b = violinOctaveBounds();
    expect(b.min).toBe(splitMidi(VIOLIN_MIDI_MIN).octave);
    expect(b.max).toBe(splitMidi(VIOLIN_MIDI_MAX).octave);
  });

  it("violinNoteOptions length", () => {
    const opts = violinNoteOptions();
    expect(opts.length).toBe(VIOLIN_MIDI_MAX - VIOLIN_MIDI_MIN + 1);
    expect(opts[0]?.midi).toBe(VIOLIN_MIDI_MIN);
  });
});

describe("validPitchClassesInOctave", () => {
  it("octave 3 starts at G", () => {
    const pcs = validPitchClassesInOctave(3);
    expect(pcs[0]).toBe(7);
  });

  it("octave 7 includes only low end of range", () => {
    const pcs = validPitchClassesInOctave(7);
    expect(pcs).toContain(0);
    expect(pcs).not.toContain(5);
  });
});

describe("nearestViolinMidiInOctave", () => {
  it("picks closest pitch class in octave", () => {
    const m = nearestViolinMidiInOctave(5, 0);
    expect(isViolinRangeMidi(m)).toBe(true);
    expect(splitMidi(m).octave).toBe(5);
  });
});

describe("nearestViolinMidiWithPitchClass", () => {
  it("prefers closer MIDI for same letter", () => {
    expect(nearestViolinMidiWithPitchClass(0, 96)).toBe(96);
    expect(nearestViolinMidiWithPitchClass(0, 90)).toBe(84);
  });
});

describe("violinChromaticNeighborMidi", () => {
  it("steps down C7 to B6", () => {
    expect(violinChromaticNeighborMidi(96, 11)).toBe(95);
  });

  it("steps up B6 to C7", () => {
    expect(violinChromaticNeighborMidi(95, 0)).toBe(96);
  });

  it("returns null below G3", () => {
    expect(violinChromaticNeighborMidi(55, 6)).toBeNull();
  });

  it("returns null for non-adjacent pitch classes", () => {
    expect(violinChromaticNeighborMidi(60, 2)).toBeNull();
  });
});

describe("midiForChromaticCircleStep", () => {
  it("uses chromatic neighbor when adjacent", () => {
    expect(midiForChromaticCircleStep(96, 11)).toBe(95);
  });

  it("returns null when adjacent step is out of range", () => {
    expect(midiForChromaticCircleStep(55, 6)).toBeNull();
  });

  it("jumps within octave for larger delta", () => {
    const m = midiForChromaticCircleStep(69, 0);
    expect(m).not.toBeNull();
    expect(isViolinRangeMidi(m!)).toBe(true);
  });
});

describe("centsFromTarget", () => {
  it("is zero when equal", () => {
    expect(centsFromTarget(440, 440)).toBeCloseTo(0, 5);
  });

  it("is positive when sharp", () => {
    expect(centsFromTarget(450, 440)).toBeGreaterThan(0);
  });
});

describe("intonationLabel", () => {
  it("buckets by magnitude", () => {
    expect(intonationLabel(0)).toBe("in tune");
    expect(intonationLabel(10)).toBe("slightly sharp");
    expect(intonationLabel(-10)).toBe("slightly flat");
    expect(intonationLabel(30)).toBe("sharp");
    expect(intonationLabel(-30)).toBe("flat");
    expect(intonationLabel(50)).toBe("very sharp");
  });
});

describe("intonationScore", () => {
  it("clamps 0 to 100", () => {
    expect(intonationScore(0)).toBe(100);
    expect(intonationScore(100)).toBe(0);
    expect(intonationScore(1000)).toBe(0);
  });
});

describe("verdictSummary", () => {
  it("returns text for known labels", () => {
    expect(verdictSummary("in tune").length).toBeGreaterThan(10);
    expect(verdictSummary("unknown")).toContain("Compare");
  });
});

describe("scoreAccentColor", () => {
  it("returns green yellow red bands", () => {
    expect(scoreAccentColor(90)).toMatch(/4ade80/i);
    expect(scoreAccentColor(70)).toMatch(/facc15/i);
    expect(scoreAccentColor(40)).toMatch(/fb7185/i);
  });
});

describe("pitchClassLabel", () => {
  it("maps index to name", () => {
    expect(pitchClassLabel(0)).toBe("C");
    expect(pitchClassLabel(11)).toBe("B");
  });
});

describe("midiFromOctavePitch", () => {
  it("matches scientific convention used in module", () => {
    expect(midiFromOctavePitch(4, 9)).toBe(69);
  });
});
