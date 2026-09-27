import { describe, expect, it } from "vitest";
import {
  defaultRootMidi,
  fingerLabelRegex,
  getInstrument,
  isPlayableMidi,
  openStringListCopy,
  parseInstrumentId,
  stringFingerLabel,
  tunerStringsFor,
  uniqueOpenStrings,
  validateScaleMidisInRange,
  vexflowClef,
} from "@/lib/instrument";

describe("instrument profiles", () => {
  it("describes violin as G D A E in treble, G3–E7", () => {
    const violin = getInstrument("violin");
    expect(violin.openStrings.map((s) => s.id)).toEqual(["G", "D", "A", "E"]);
    expect(vexflowClef(violin)).toBe("treble");
    expect(violin.midiMin).toBe(55);
    expect(violin.midiMax).toBe(100);
    expect(violin.defaultRootOctave).toBe(4);
    expect(openStringListCopy(violin)).toBe("G, D, A, or E");
    expect(violin.listenSoundfont).toBe("violin");
  });

  it("describes viola as C G D A in alto, C3–A6", () => {
    const viola = getInstrument("viola");
    expect(viola.openStrings.map((s) => s.id)).toEqual(["C", "G", "D", "A"]);
    expect(vexflowClef(viola)).toBe("alto");
    expect(viola.midiMin).toBe(48);
    expect(viola.midiMax).toBe(93);
    expect(viola.defaultRootOctave).toBe(3);
    expect(openStringListCopy(viola)).toBe("C, G, D, or A");
    expect(viola.listenSoundfont).toBe("viola");
  });

  it("describes piano as A0–C8 with no open strings", () => {
    const piano = getInstrument("piano");
    expect(piano.openStrings).toEqual([]);
    expect(piano.staffSystem).toBe("grand");
    expect(piano.midiMin).toBe(21);
    expect(piano.midiMax).toBe(108);
    expect(defaultRootMidi(0, piano)).toBe(60);
    expect(piano.listenSoundfont).toBe("piano");
    expect(openStringListCopy(piano)).toBe("");
    expect(tunerStringsFor(piano)).toEqual([]);
  });

  it("finds unique open strings without id checks at the call site", () => {
    expect(uniqueOpenStrings(getInstrument("violin")).map((s) => s.id)).toEqual([
      "E",
    ]);
    expect(uniqueOpenStrings(getInstrument("viola")).map((s) => s.id)).toEqual([
      "C",
    ]);
  });
});

describe("playable range", () => {
  it("lets viola play C3 and keeps violin starting at G3", () => {
    const violin = getInstrument("violin");
    const viola = getInstrument("viola");
    expect(isPlayableMidi(48, viola)).toBe(true);
    expect(isPlayableMidi(48, violin)).toBe(false);
    expect(isPlayableMidi(55, violin)).toBe(true);
    expect(isPlayableMidi(100, violin)).toBe(true);
    expect(isPlayableMidi(100, viola)).toBe(false);
  });
});

describe("scale defaults", () => {
  it("starts C major on C4 for violin and C3 for viola", () => {
    expect(defaultRootMidi(0, getInstrument("violin"))).toBe(60);
    expect(defaultRootMidi(0, getInstrument("viola"))).toBe(48);
  });

  it("rejects a 2-octave run that leaves the instrument", () => {
    const viola = getInstrument("viola");
    expect(validateScaleMidisInRange([48, 60], viola)).toBe(true);
    expect(validateScaleMidisInRange([48, 100], viola)).toBe(false);
  });
});

describe("fingering labels", () => {
  it("labels violin opens and prefers E0 over A4", () => {
    const violin = getInstrument("violin");
    expect(stringFingerLabel(55, violin)).toBe("G0");
    expect(stringFingerLabel(76, violin)).toBe("E0");
    expect(stringFingerLabel(60, violin)).toBe("G3");
    // A string, 2nd finger — C.
    expect(stringFingerLabel(72, violin)).toBe("A2");
  });

  it("labels viola opens including C0", () => {
    const viola = getInstrument("viola");
    expect(stringFingerLabel(48, viola)).toBe("C0");
    expect(stringFingerLabel(55, viola)).toBe("G0");
    expect(stringFingerLabel(69, viola)).toBe("A0");
    expect(fingerLabelRegex(viola).test("c0")).toBe(true);
  });
});

describe("tuner string table", () => {
  it("maps profile strings to tuner refs", () => {
    const strings = tunerStringsFor(getInstrument("viola"));
    expect(strings.map((s) => s.refMidi)).toEqual([48, 55, 62, 69]);
  });
});

describe("parseInstrumentId", () => {
  it("falls back to violin", () => {
    expect(parseInstrumentId("viola")).toBe("viola");
    expect(parseInstrumentId("piano")).toBe("piano");
    expect(parseInstrumentId("cello")).toBe("violin");
    expect(parseInstrumentId(null)).toBe("violin");
  });
});
