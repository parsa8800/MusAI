import { describe, expect, it } from "vitest";
import { placeFingerLabel } from "@/lib/fingerLabelPlacement";

const staffTop = 98.5;
const spacing = 18;

describe("placeFingerLabel", () => {
  it("keeps every in-staff note on one row above the top line", () => {
    const centers = [188, 179, 170, 161, 152, 143, 134, 125];
    const baselines = centers.map(
      (noteCenterY) =>
        placeFingerLabel({
          staffTop,
          lineSpacing: spacing,
          noteCenterY,
          stemTipY: noteCenterY - 58,
          stemUp: noteCenterY > 130,
        }).baseline,
    );
    expect(new Set(baselines).size).toBe(1);
    expect(baselines[0]).toBeCloseTo(staffTop - spacing, 5);
    expect(baselines[0]).toBeLessThan(staffTop - 8);
  });

  it("lifts a note that sits above the staff", () => {
    const inStaff = placeFingerLabel({
      staffTop,
      lineSpacing: spacing,
      noteCenterY: 125,
      stemTipY: 180,
      stemUp: false,
    });
    const above = placeFingerLabel({
      staffTop,
      lineSpacing: spacing,
      noteCenterY: staffTop - spacing,
      stemTipY: staffTop + 40,
      stemUp: false,
    });
    expect(above.baseline).toBeLessThan(inStaff.baseline);
    expect(above.baseline).toBeCloseTo(staffTop - spacing * 2.5, 5);
  });

  it("stops a stem that would run through the label", () => {
    const placed = placeFingerLabel({
      staffTop,
      lineSpacing: spacing,
      noteCenterY: 143,
      stemTipY: 70,
      stemUp: true,
    });
    expect(placed.stemTipFloor).not.toBeNull();
    expect(placed.stemTipFloor!).toBeGreaterThan(placed.baseline);
  });

  it("leaves a stem that already clears the label", () => {
    const placed = placeFingerLabel({
      staffTop,
      lineSpacing: spacing,
      noteCenterY: 170,
      stemTipY: 112,
      stemUp: true,
    });
    expect(placed.stemTipFloor).toBeNull();
  });
});
