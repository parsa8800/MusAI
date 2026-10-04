import { describe, expect, it, vi } from "vitest";
import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import {
  applyPlayheadElement,
  buildPlayheadWaypoints,
  followPlayheadInScrollParent,
  interpolatePlayhead,
  playheadStaffSpan,
  SCORE_PLAYHEAD_WIDTH_PX,
} from "@/features/piece-studio/score/scorePlayhead";
import type { StaffBand } from "@/features/piece-studio/score/staffBands";

const snaps: CursorPose[] = [
  { tSec: 0, x: 40, y: 20, height: 40 },
  { tSec: 0.5, x: 70, y: 20, height: 40 },
  { tSec: 1.0, x: 110, y: 20, height: 40 },
  { tSec: 1.5, x: 150, y: 20, height: 40 },
  { tSec: 2.0, x: 40, y: 90, height: 40 },
];

const staff: StaffBand[] = [
  { y: 18, height: 44, x: 20, width: 400 },
  { y: 88, height: 44, x: 20, width: 400 },
];

function wrapTime(points: readonly CursorPose[]): number {
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.x + 20 < points[i - 1]!.x) return points[i]!.tSec;
  }
  return Number.POSITIVE_INFINITY;
}

describe("score playhead geometry", () => {
  it("is a thin vertical bar taller than it is wide", () => {
    const bar = interpolatePlayhead(snaps, 0.25, staff);
    expect(bar).not.toBeNull();
    expect(bar!.width).toBe(SCORE_PLAYHEAD_WIDTH_PX);
    expect(bar!.height).toBeGreaterThan(bar!.width);
    expect(bar!.height).toBeGreaterThan(40);
  });

  it("starts on the first note when the piece begins at t=0", () => {
    const atStart = interpolatePlayhead(snaps, 0, staff)!;
    expect(atStart.centerX).toBeCloseTo(snaps[0]!.x);
    expect(atStart.y).toBeLessThan(snaps[4]!.y);
  });

  it("approaches from the clef when the first attack is later", () => {
    const late: CursorPose[] = [
      { tSec: 0.5, x: 80, y: 20, height: 40 },
      { tSec: 1.0, x: 120, y: 20, height: 40 },
    ];
    const atStart = interpolatePlayhead(late, 0, staff)!;
    expect(atStart.centerX).toBeLessThan(late[0]!.x - 8);
    expect(interpolatePlayhead(late, 0.5, staff)!.centerX).toBeCloseTo(80);
  });

  it("slides between notes and is halfway at the midpoint", () => {
    const bar = interpolatePlayhead(snaps, 0.75, staff);
    expect(bar!.centerX).toBeCloseTo((snaps[1]!.x + snaps[2]!.x) / 2);
  });

  it("keeps travelling through a span and lands on the next note", () => {
    const mid = interpolatePlayhead(snaps, 0.7, staff)!;
    const late = interpolatePlayhead(snaps, 0.92, staff)!;
    const atNext = interpolatePlayhead(snaps, 1.0, staff)!;
    expect(mid.centerX).toBeGreaterThan(snaps[1]!.x);
    expect(mid.centerX).toBeLessThan(snaps[2]!.x);
    expect(late.centerX).toBeGreaterThan(mid.centerX);
    expect(late.centerX).toBeLessThan(snaps[2]!.x);
    expect(atNext.centerX).toBeCloseTo(snaps[2]!.x);
  });

  it("crosses each note centre exactly at its attack time", () => {
    for (const snap of snaps) {
      const bar = interpolatePlayhead(snaps, snap.tSec, staff);
      expect(bar!.centerX).toBeCloseTo(snap.x);
      expect(bar!.x + bar!.width / 2).toBeCloseTo(snap.x);
    }
  });

  it("keeps moving right past the last note of a line before wrapping", () => {
    const lastOnLine = snaps[3]!;
    const waypoints = buildPlayheadWaypoints(snaps, staff);
    const tWrap = wrapTime(waypoints);
    const midway = interpolatePlayhead(
      snaps,
      (lastOnLine.tSec + snaps[4]!.tSec) / 2,
      staff,
    )!;
    expect(tWrap).toBeCloseTo(snaps[4]!.tSec);
    expect(midway.centerX).toBeGreaterThan(lastOnLine.x + 24);
    expect(midway.y).toBeLessThan(snaps[4]!.y);

    const bar = interpolatePlayhead(snaps, tWrap - 0.01, staff)!;
    expect(bar.centerX).toBeGreaterThan(lastOnLine.x + 8);
    expect(bar.y).toBeLessThan(snaps[4]!.y);

    const onNext = interpolatePlayhead(snaps, tWrap, staff)!;
    expect(onNext.y).toBeGreaterThan(70);
    expect(onNext.centerX).toBeLessThan(snaps[4]!.x + 1);
  });

  it("never freezes then jumps on a system — x is non-decreasing until wrap", () => {
    const waypoints = buildPlayheadWaypoints(snaps, staff);
    const tWrap = wrapTime(waypoints);
    let prev = Number.NEGATIVE_INFINITY;
    for (let t = 0; t < tWrap - 1e-3; t += 0.02) {
      const x = interpolatePlayhead(snaps, t, staff)!.centerX;
      expect(x).toBeGreaterThanOrEqual(prev - 0.05);
      prev = x;
    }
  });

  it("does not smear diagonally across systems", () => {
    const waypoints = buildPlayheadWaypoints(snaps, staff);
    const tWrap = wrapTime(waypoints);
    const before = interpolatePlayhead(snaps, tWrap - 0.01, staff)!;
    const after = interpolatePlayhead(snaps, tWrap, staff)!;
    expect(before.centerX).toBeGreaterThan(snaps[3]!.x);
    expect(after.centerX).toBeLessThan(snaps[4]!.x + 1);
    expect(after.y).toBeGreaterThan(before.y + 20);
  });

  it("settles past the final note after the piece ends", () => {
    const bar = interpolatePlayhead(snaps, 9, staff);
    expect(bar!.centerX).toBeGreaterThan(snaps[4]!.x + 8);
    expect(bar!.y).toBeGreaterThan(70);
  });

  it("keeps a fixed staff height through a pitch leap — no vertical chasing", () => {
    const leap: CursorPose[] = [
      { tSec: 0, x: 40, y: 48, height: 12 },
      { tSec: 0.5, x: 90, y: 18, height: 12 },
      { tSec: 1, x: 140, y: 36, height: 12 },
    ];
    const staffBand: StaffBand[] = [
      { y: 30, height: 44, x: 20, width: 400 },
    ];
    const a = interpolatePlayhead(leap, 0.1, staffBand)!;
    const b = interpolatePlayhead(leap, 0.75, staffBand)!;
    const c = interpolatePlayhead(leap, 0.95, staffBand)!;
    expect(b.centerX).toBeCloseTo(115);
    expect(c.centerX).toBeCloseTo(135);
    expect(c.centerX).toBeGreaterThan(b.centerX);
    expect(a.y).toBeCloseTo(b.y, 1);
    expect(b.y).toBeCloseTo(c.y, 1);
    expect(a.height).toBeCloseTo(b.height, 1);
    expect(a.height).toBeGreaterThan(44);
  });

  it("locks vertical span even without staff bands (median of the line)", () => {
    const leap: CursorPose[] = [
      { tSec: 0, x: 40, y: 60, height: 10 },
      { tSec: 0.5, x: 90, y: 20, height: 10 },
      { tSec: 1, x: 140, y: 40, height: 10 },
    ];
    const low = interpolatePlayhead(leap, 0.05)!;
    const high = interpolatePlayhead(leap, 0.5)!;
    expect(low.y).toBeCloseTo(high.y, 1);
    expect(low.height).toBeCloseTo(high.height, 1);
  });

  it("handles repeated notes at the same engraved x without jumping", () => {
    const repeated: CursorPose[] = [
      { tSec: 0, x: 80, y: 30, height: 36 },
      { tSec: 0.5, x: 80, y: 30, height: 36 },
      { tSec: 1, x: 120, y: 30, height: 36 },
    ];
    expect(interpolatePlayhead(repeated, 0.25)!.centerX).toBeCloseTo(80);
    expect(interpolatePlayhead(repeated, 0.75)!.centerX).toBeCloseTo(100);
    expect(interpolatePlayhead(repeated, 1)!.centerX).toBeCloseTo(120);
  });

  it("travels across a long note and arrives when the next one sounds", () => {
    const uneven: CursorPose[] = [
      { tSec: 0, x: 40, y: 20, height: 40 },
      { tSec: 0.5, x: 80, y: 20, height: 40 },
      { tSec: 2.5, x: 120, y: 20, height: 40 },
    ];
    expect(interpolatePlayhead(uneven, 0.5)!.centerX).toBeCloseTo(80);
    expect(interpolatePlayhead(uneven, 1.5)!.centerX).toBeCloseTo(100);
    expect(interpolatePlayhead(uneven, 2.5)!.centerX).toBeCloseTo(120);
  });

  it("keeps moving through a rest and meets the next note on time", () => {
    const held: CursorPose[] = [
      { tSec: 0, endSec: 0.5, x: 40, y: 20, height: 40 },
      { tSec: 1.0, endSec: 1.5, x: 120, y: 20, height: 40 },
    ];
    expect(interpolatePlayhead(held, 0, staff)!.centerX).toBeCloseTo(40);
    expect(interpolatePlayhead(held, 0.5, staff)!.centerX).toBeCloseTo(80);
    expect(interpolatePlayhead(held, 1.0, staff)!.centerX).toBeCloseTo(120);
    const duringLast = interpolatePlayhead(held, 1.3, staff)!;
    expect(duringLast.centerX).toBeGreaterThan(120);
    expect(duringLast.y).toBeCloseTo(interpolatePlayhead(held, 1.0, staff)!.y, 1);
  });

  it("glides across touching notes and meets the next head on time", () => {
    const legato: CursorPose[] = [
      { tSec: 0, endSec: 0.5, x: 40, y: 20, height: 40 },
      { tSec: 0.5, endSec: 1, x: 100, y: 20, height: 40 },
    ];
    expect(interpolatePlayhead(legato, 0.25, staff)!.centerX).toBeCloseTo(70);
    expect(interpolatePlayhead(legato, 0.5, staff)!.centerX).toBeCloseTo(100);
  });

  it("spans the engraved staff band, not a notehead-sized box", () => {
    const pose: CursorPose = { tSec: 0, x: 100, y: 40, height: 12 };
    const span = playheadStaffSpan(pose, staff);
    expect(span.height).toBeGreaterThan(44);
    expect(span.y).toBeLessThanOrEqual(18);
  });

  it("writes transform without CSS animation", () => {
    const el = document.createElement("span");
    const bar = interpolatePlayhead(snaps, 0.5, staff)!;
    applyPlayheadElement(el, bar);
    expect(el.style.visibility).toBe("visible");
    expect(el.style.transform).toContain(`${bar.x}px`);
    expect(el.style.transition).toBe("");
  });

  it("scrolls immediately so the view stays with the audio", () => {
    const wrap = document.createElement("div");
    Object.defineProperty(wrap, "clientHeight", { value: 120 });
    Object.defineProperty(wrap, "scrollTop", { value: 0, writable: true });
    const scrollTo = vi.fn();
    wrap.scrollTo = scrollTo as unknown as typeof wrap.scrollTo;
    const last = { current: 20 };
    followPlayheadInScrollParent(
      wrap,
      { tSec: 2, x: 40, y: 200, width: 3, height: 50, centerX: 41.5 },
      last,
    );
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );
  });
});
