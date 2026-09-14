import { describe, expect, it } from "vitest";
import {
  interpolateCursor,
  interpolateCursorBand,
  pickCursorTime,
  type CursorPose,
} from "@/features/piece-studio/score/cursorTrack";

const snaps: CursorPose[] = [
  { tSec: 0, x: 40, y: 20, height: 40 },
  { tSec: 0.5, x: 70, y: 20, height: 40 },
  { tSec: 1.0, x: 110, y: 20, height: 40 },
  { tSec: 1.5, x: 150, y: 20, height: 40 },
  { tSec: 2.0, x: 40, y: 90, height: 40 },
];

describe("cursorTrack follow overlays", () => {
  it("interpolates along a system using musical time", () => {
    const pose = interpolateCursor(snaps, 0.25);
    expect(pose?.x).toBeCloseTo(55);
    expect(pose?.y).toBe(20);
  });

  it("does not draw a diagonal when the music moves to the next system", () => {
    const pose = interpolateCursor(snaps, 1.7);
    expect(pose?.x).toBe(150);
    expect(pose?.y).toBe(20);
  });

  it("builds a note band and softer measure emphasis", () => {
    const band = interpolateCursorBand(snaps, 0.6);
    expect(band).not.toBeNull();
    expect(band!.width).toBeGreaterThan(10);
    expect(band!.width).toBeLessThanOrEqual(48);
    expect(band!.measureWidth).toBeGreaterThan(band!.width);
    expect(band!.measureX).toBeLessThanOrEqual(band!.x);
  });

  it("maps a click to the nearest note time", () => {
    expect(pickCursorTime(snaps, 108, 30)).toBe(1.0);
    expect(pickCursorTime(snaps, 42, 95)).toBe(2.0);
  });
});
