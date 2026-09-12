import { describe, expect, it } from "vitest";
import {
  NOTE_RING_CX,
  NOTE_RING_CY,
  NOTE_RING_R_IN,
  NOTE_RING_R_WEDGE,
  NOTE_RING_R_OUT,
  annulusClipPath,
  distFromCentre,
  insetWedgePath,
  lerpDeg,
  midAngleForPitchClass,
  pitchClassFromRingCoordinates,
  polar,
  shortestDegDelta,
  wedgeAngles,
  wedgePath,
  wedgePathForPitchClass,
} from "@/lib/noteRingGeometry";

function pathPoints(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re =
    /(?:M|L)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)|A\s+\d+\.\d+\s+\d+\.\d+\s+\d+\s+\d+\s+\d+\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1] != null && m[2] != null) out.push({ x: Number(m[1]), y: Number(m[2]) });
    else if (m[3] != null && m[4] != null)
      out.push({ x: Number(m[3]), y: Number(m[4]) });
  }
  return out;
}

describe("noteRingGeometry", () => {
  it("keeps wedge corners on the inner and outer radii", () => {
    const { start, end } = wedgeAngles(0);
    const d = wedgePath(start, end, NOTE_RING_R_IN, NOTE_RING_R_WEDGE);
    const pts = pathPoints(d);
    expect(pts.length).toBeGreaterThanOrEqual(4);
    const [p1, p2, p3, p4] = pts;
    expect(distFromCentre(p1!.x, p1!.y)).toBeCloseTo(NOTE_RING_R_IN, 2);
    expect(distFromCentre(p2!.x, p2!.y)).toBeCloseTo(NOTE_RING_R_WEDGE, 2);
    expect(distFromCentre(p3!.x, p3!.y)).toBeCloseTo(NOTE_RING_R_WEDGE, 2);
    expect(distFromCentre(p4!.x, p4!.y)).toBeCloseTo(NOTE_RING_R_IN, 2);
  });

  it("keeps every wedge inside the outer silhouette", () => {
    for (let pc = 0; pc < 12; pc++) {
      const pts = pathPoints(wedgePathForPitchClass(pc));
      for (const p of pts) {
        expect(distFromCentre(p.x, p.y)).toBeLessThanOrEqual(
          NOTE_RING_R_OUT + 0.05,
        );
      }
    }
  });

  it("insets the glass edge strictly inside the wedge radii", () => {
    const { start, end } = wedgeAngles(4);
    const d = insetWedgePath(start, end);
    for (const p of pathPoints(d)) {
      const r = distFromCentre(p.x, p.y);
      expect(r).toBeGreaterThan(NOTE_RING_R_IN + 1);
      expect(r).toBeLessThan(NOTE_RING_R_WEDGE - 1);
    }
  });

  it("does not let neighbouring wedge interiors share an angle", () => {
    const a = wedgeAngles(0);
    const b = wedgeAngles(1);
    expect(a.end).toBeLessThan(b.start);
  });

  it("maps pointer coordinates to pitch class without leaving the annulus", () => {
    const top = polar(-90, (NOTE_RING_R_IN + NOTE_RING_R_WEDGE) / 2);
    expect(pitchClassFromRingCoordinates(top.x, top.y)).toBe(0);
    expect(pitchClassFromRingCoordinates(NOTE_RING_CX, NOTE_RING_CY)).toBeNull();
    expect(
      pitchClassFromRingCoordinates(NOTE_RING_CX + NOTE_RING_R_OUT + 20, NOTE_RING_CY),
    ).toBeNull();
  });

  it("takes the short way around when interpolating selection", () => {
    expect(shortestDegDelta(350, 10)).toBeCloseTo(20);
    expect(shortestDegDelta(10, 350)).toBeCloseTo(-20);
    const mid = lerpDeg(350, 10, 0.5);
    expect(shortestDegDelta(mid, 0)).toBeCloseTo(0);
  });

  it("places C at the top and F# opposite", () => {
    const c = midAngleForPitchClass(0);
    const fs = midAngleForPitchClass(6);
    expect(polar(c, 80).y).toBeLessThan(NOTE_RING_CY);
    expect(Math.abs(shortestDegDelta(c, fs))).toBeCloseTo(180, 0);
  });

  it("builds a closed annulus clip with a hole", () => {
    const d = annulusClipPath();
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/A /g)?.length).toBeGreaterThanOrEqual(4);
  });
});
