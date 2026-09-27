import { describe, expect, it } from "vitest";
import {
  LISTEN_UNDERLINE_HEIGHT_MAX,
  LISTEN_UNDERLINE_HEIGHT_MIN,
  LISTEN_UNDERLINE_MAX,
  LISTEN_UNDERLINE_MIN,
  notePlateFromPose,
  shapeNoteFocusUnderline,
  shapeNotePlateRect,
} from "@/features/piece-studio/score/notePlate";

describe("notePlate shared geometry", () => {
  it("sizes Practise as an underline under the staff band", () => {
    const fromRect = shapeNoteFocusUnderline({
      x: 80,
      y: 20,
      width: 48,
      height: 48,
    });
    expect(fromRect.width).toBeGreaterThan(fromRect.height);
    expect(fromRect.width).toBeGreaterThanOrEqual(LISTEN_UNDERLINE_MIN);
    expect(fromRect.width).toBeLessThanOrEqual(LISTEN_UNDERLINE_MAX * 1.55);
    expect(fromRect.height).toBeGreaterThanOrEqual(LISTEN_UNDERLINE_HEIGHT_MIN);
    expect(fromRect.height).toBeLessThanOrEqual(LISTEN_UNDERLINE_HEIGHT_MAX);
    // Under the noteheads — bottom of the staff band, not over the oval.
    expect(fromRect.y).toBeGreaterThan(20 + 48 * 0.7);
    expect(shapeNotePlateRect({ x: 80, y: 20, width: 48, height: 48 })).toEqual(
      fromRect,
    );
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
