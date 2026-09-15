import { describe, expect, it } from "vitest";
import {
  LISTEN_UNDERLINE_HEIGHT_MAX,
  LISTEN_UNDERLINE_HEIGHT_MIN,
  LISTEN_UNDERLINE_MAX,
  LISTEN_UNDERLINE_MIN,
  NOTE_PLATE_MAX,
  NOTE_PLATE_MIN,
  notePlateFromPose,
  shapeNotePlateRect,
} from "@/features/piece-studio/score/notePlate";

describe("notePlate shared geometry", () => {
  it("sizes Practise as a tight square on the staff band", () => {
    const fromRect = shapeNotePlateRect({
      x: 80,
      y: 20,
      width: 48,
      height: 48,
    });
    expect(fromRect.width).toBe(fromRect.height);
    expect(fromRect.width).toBeGreaterThanOrEqual(NOTE_PLATE_MIN);
    expect(fromRect.width).toBeLessThanOrEqual(NOTE_PLATE_MAX);
    expect(fromRect.y).toBeGreaterThan(20);
    expect(fromRect.y + fromRect.height).toBeLessThan(20 + 48);
  });

  it("sizes Listen as an underline below the notehead", () => {
    const fromPose = notePlateFromPose({ x: 100, y: 20, height: 48 });
    expect(fromPose.width).toBeGreaterThanOrEqual(LISTEN_UNDERLINE_MIN);
    expect(fromPose.width).toBeLessThanOrEqual(LISTEN_UNDERLINE_MAX);
    expect(fromPose.height).toBeGreaterThanOrEqual(LISTEN_UNDERLINE_HEIGHT_MIN);
    expect(fromPose.height).toBeLessThanOrEqual(LISTEN_UNDERLINE_HEIGHT_MAX);
    expect(fromPose.width).toBeGreaterThan(fromPose.height);
    expect(fromPose.y).toBeGreaterThan(20 + 48 * 0.5);
    expect(fromPose.x + fromPose.width / 2).toBeCloseTo(100);
  });
});
