import { describe, expect, it } from "vitest";
import {
  notationEngravingPlan,
  notationFitFromBoxes,
  notationFitLayoutShift,
  notationFitScale,
  notationNoteGapForWidth,
  notationViewBoxFromInk,
  unionClientBoxes,
} from "@/lib/notationFit";
import { STAFF_NOTE_MIN_GAP_PX } from "@/lib/staffChunking";

const C_MAJOR_2OCT_ASC = [
  60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84,
];
const C_MAJOR_2OCT_DESC = [
  84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60,
];

describe("notationFitScale", () => {
  it("stays at 1 when content already fits", () => {
    expect(notationFitScale(400, 300, 400, 280)).toBe(1);
  });

  it("shrinks to the tighter axis so nothing is clipped", () => {
    expect(notationFitScale(200, 100, 400, 100)).toBeCloseTo(0.5);
    expect(notationFitScale(400, 80, 400, 160)).toBeCloseTo(0.5);
  });

  it("has no 0.72 floor that would leave overflow", () => {
    expect(notationFitScale(100, 40, 400, 200)).toBeCloseTo(0.2);
  });
});

describe("notationViewBoxFromInk", () => {
  it("keeps the stave width when ink stays on the canvas", () => {
    expect(
      notationViewBoxFromInk(
        400,
        { minX: 12, minY: 20, maxX: 380, maxY: 120 },
        10,
      ),
    ).toEqual({ x: 0, y: 10, width: 400, height: 120 });
  });

  it("expands for stems, arrows, and clef that spill past the canvas", () => {
    const box = notationViewBoxFromInk(
      400,
      { minX: -8, minY: -4, maxX: 412, maxY: 140 },
      8,
    );
    expect(box).toEqual({ x: -16, y: -12, width: 436, height: 160 });
  });
});

describe("notationFitLayoutShift", () => {
  it("clears margins when no scale is needed", () => {
    expect(notationFitLayoutShift(1, 400, 200)).toEqual({
      marginRight: 0,
      marginBottom: 0,
    });
  });

  it("shrinks the layout box to the visual size after scale", () => {
    expect(notationFitLayoutShift(0.5, 400, 200)).toEqual({
      marginRight: -200,
      marginBottom: -100,
    });
  });
});

describe("unionClientBoxes / notationFitFromBoxes", () => {
  it("unions painted marks including arrows that sit outside the staff box", () => {
    expect(
      unionClientBoxes([
        { left: 10, top: 20, right: 200, bottom: 80 },
        { left: 8, top: 4, right: 24, bottom: 22 },
      ]),
    ).toEqual({ left: 8, top: 4, right: 200, bottom: 80 });
  });

  it("scales from the painted union, not a cropped layout box", () => {
    const host = { left: 0, top: 0, right: 200, bottom: 100 };
    const ink = { left: -10, top: -20, right: 220, bottom: 140 };
    expect(notationFitFromBoxes(host, ink, 0)).toBeCloseTo(100 / 160);
  });
});

describe("notationNoteGapForWidth", () => {
  it("keeps a two-octave run on one staff by tightening the gap", () => {
    const wide = notationNoteGapForWidth(900, 15, STAFF_NOTE_MIN_GAP_PX);
    expect(wide).toBe(STAFF_NOTE_MIN_GAP_PX);
    const mid = notationNoteGapForWidth(480, 15, STAFF_NOTE_MIN_GAP_PX);
    expect(mid).toBeLessThan(STAFF_NOTE_MIN_GAP_PX);
    expect(mid).toBeGreaterThanOrEqual(20);
  });
});

describe("notationEngravingPlan", () => {
  it("uses one system per direction on a wide, tall frame", () => {
    const plan = notationEngravingPlan({
      availableWidth: 900,
      availableHeight: 420,
      ascendingMidis: C_MAJOR_2OCT_ASC,
      descendingMidis: C_MAJOR_2OCT_DESC,
      pad: true,
    });
    expect(plan.systemCount).toBe(2);
    expect(plan.maxPerRow).toBeGreaterThanOrEqual(15);
  });

  it("tightens spacing on a short frame instead of overflowing", () => {
    const roomy = notationEngravingPlan({
      availableWidth: 700,
      availableHeight: 420,
      ascendingMidis: C_MAJOR_2OCT_ASC,
      descendingMidis: C_MAJOR_2OCT_DESC,
      pad: true,
    });
    const short = notationEngravingPlan({
      availableWidth: 700,
      availableHeight: 140,
      ascendingMidis: C_MAJOR_2OCT_ASC,
      descendingMidis: C_MAJOR_2OCT_DESC,
      pad: true,
    });
    expect(short.lineSpacingPx).toBeLessThanOrEqual(roomy.lineSpacingPx);
    expect(short.inkPad).toBeLessThanOrEqual(roomy.inkPad);
  });
});
