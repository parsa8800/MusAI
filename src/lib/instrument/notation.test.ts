import { describe, expect, it } from "vitest";
import { getInstrument } from "@/lib/instrument/catalog";
import {
  CLEF_STAFF,
  clefForNotes,
  clefGlyph,
} from "@/lib/instrument/notation";
import { staffStepFromVexKey } from "@/lib/vexflowScaleSpelling";

describe("clefForNotes", () => {
  const violin = getInstrument("violin");
  const viola = getInstrument("viola");

  it("keeps violin in treble across the playable span", () => {
    expect(clefForNotes(violin, [55, 76])).toBe("treble");
    expect(clefForNotes(violin, [69, 81])).toBe("treble");
  });

  it("uses alto for ordinary viola writing, never bass", () => {
    expect(clefForNotes(viola, [])).toBe("alto");
    expect(clefForNotes(viola, [48, 55, 60])).toBe("alto");
    expect(clefForNotes(viola, [48, 50, 52, 53, 55, 57, 59, 60])).toBe("alto");
    expect(clefForNotes(viola, [48, 72])).toBe("alto");
    expect(clefForNotes(viola, [48, 76])).toBe("alto");
    expect(clefForNotes(viola, [48, 76])).not.toBe("treble");
  });

  it("writes piano middle-C scales in treble and low scales in bass", () => {
    const piano = getInstrument("piano");
    expect(clefForNotes(piano, [])).toBe("treble");
    expect(clefForNotes(piano, [60, 72])).toBe("treble");
    expect(clefForNotes(piano, [36, 48])).toBe("bass");
  });

  it("moves viola into treble for high passages", () => {
    expect(clefForNotes(viola, [69, 72, 76])).toBe("treble");
    expect(clefForNotes(viola, [62, 67, 76])).toBe("treble");
  });
});

describe("clef staff geometry", () => {
  it("places C4 on the middle line in alto and below the staff in treble", () => {
    const c4 = staffStepFromVexKey("c/4");
    expect(c4).toBe(CLEF_STAFF.alto.midStep);
    expect(c4).toBeLessThan(CLEF_STAFF.treble.bottomStep);
  });

  it("places G4 on the top alto line and inside the treble staff", () => {
    const g4 = staffStepFromVexKey("g/4");
    expect(g4).toBe(CLEF_STAFF.alto.topStep);
    expect(g4).toBeGreaterThan(CLEF_STAFF.treble.bottomStep);
    expect(g4).toBeLessThan(CLEF_STAFF.treble.topStep);
  });
});

describe("clef glyphs", () => {
  it("uses G-clef for treble and C-clef for alto", () => {
    expect(clefGlyph("treble").glyph).toBe("\uE050");
    expect(clefGlyph("alto").glyph).toBe("\uE05C");
    expect(clefGlyph("alto").originStep).toBe(4);
    expect(clefGlyph("treble").originStep).toBe(6);
    expect(clefGlyph("bass").glyph).toBe("\uE062");
    expect(clefGlyph("bass").originStep).toBe(2);
  });
});
