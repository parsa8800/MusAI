import { describe, expect, it } from "vitest";
import {
  interpolateCursor,
  interpolateCursorBand,
  pickCursorTime,
  type CursorPose,
} from "@/features/piece-studio/score/cursorTrack";
import { notePlateFromPose } from "@/features/piece-studio/score/notePlate";

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

  it("builds an underline that holds on the sounding note", () => {
    const band = interpolateCursorBand(snaps, 0.6);
    expect(band).not.toBeNull();
    expect(band!.width).toBeGreaterThan(band!.height);
    expect(band!.width).toBeGreaterThanOrEqual(18);
    expect(band!.width).toBeLessThanOrEqual(30);
    expect(band!.measureWidth).toBeUndefined();
    // Hold on the 0.5s attack — do not smear toward the 1.0s note.
    expect(band!.x).toBeCloseTo(notePlateFromPose(snaps[1]!).x);
    expect(band!.x + band!.width).toBeLessThan(snaps[2]!.x);
    // Underline is centred on the attack x, below the notehead.
    expect(band!.x + band!.width / 2).toBeCloseTo(snaps[1]!.x);
    expect(band!.y).toBeGreaterThan(snaps[1]!.y + snaps[1]!.height * 0.5);
  });

  it("keeps interpolated band x within the engraved content span", () => {
    // Simulated post-scale snaps that already sit on the staff.
    const onStaff: CursorPose[] = [
      { tSec: 0, x: 300, y: 40, height: 40 },
      { tSec: 1, x: 420, y: 40, height: 40 },
      { tSec: 2, x: 540, y: 40, height: 40 },
      { tSec: 3, x: 660, y: 40, height: 40 },
    ];
    const contentRight = 700;
    for (const t of [0, 0.5, 1.5, 2.5, 3]) {
      const band = interpolateCursorBand(onStaff, t);
      expect(band).not.toBeNull();
      expect(band!.x).toBeGreaterThanOrEqual(280);
      expect(band!.x + band!.width).toBeLessThanOrEqual(contentRight + 20);
    }
  });

  it("maps a click to the nearest note time", () => {
    expect(pickCursorTime(snaps, 108, 30)).toBe(1.0);
    expect(pickCursorTime(snaps, 42, 95)).toBe(2.0);
  });
});
