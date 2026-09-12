/** Chromatic note wheel — annular 12-step geometry in SVG user space. */

export const NOTE_RING_CX = 120;
export const NOTE_RING_CY = 120;
export const NOTE_RING_SIZE = 240;
/** Outer silhouette of the wheel. */
export const NOTE_RING_R_OUT = 108;
/** Wedges sit inside the rim so strokes cannot break the circle. */
export const NOTE_RING_R_WEDGE = 106.2;
export const NOTE_RING_R_IN = 62;
export const NOTE_RING_STEPS = 12;
export const NOTE_RING_STEP_DEG = 360 / NOTE_RING_STEPS;
/** Hairline gap so neighbouring wedges never share an edge. */
export const NOTE_RING_GAP_DEG = 0.85;
/** C at 12 o'clock, then clockwise. */
export const NOTE_RING_ZERO_DEG = -90;

export function polar(
  angleDeg: number,
  r: number,
  cx = NOTE_RING_CX,
  cy = NOTE_RING_CY,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function distFromCentre(
  x: number,
  y: number,
  cx = NOTE_RING_CX,
  cy = NOTE_RING_CY,
): number {
  return Math.hypot(x - cx, y - cy);
}

/** Pitch-class sector, with an optional extra gap (press inset). */
export function wedgeAngles(
  pc: number,
  extraGapDeg = 0,
): { start: number; end: number; mid: number } {
  const i = ((pc % 12) + 12) % 12;
  const gap = NOTE_RING_GAP_DEG + extraGapDeg;
  const start = NOTE_RING_ZERO_DEG + i * NOTE_RING_STEP_DEG + gap;
  const end = NOTE_RING_ZERO_DEG + (i + 1) * NOTE_RING_STEP_DEG - gap;
  return { start, end, mid: (start + end) / 2 };
}

export function midAngleForPitchClass(pc: number): number {
  return wedgeAngles(pc).mid;
}

/**
 * Annular sector path (exact inner/outer radii, exact start/end).
 * Sweep is clockwise to match C → C# around the wheel.
 */
export function wedgePath(
  startDeg: number,
  endDeg: number,
  innerR: number,
  outerR: number,
  cx = NOTE_RING_CX,
  cy = NOTE_RING_CY,
): string {
  const p1 = polar(startDeg, innerR, cx, cy);
  const p2 = polar(startDeg, outerR, cx, cy);
  const p3 = polar(endDeg, outerR, cx, cy);
  const p4 = polar(endDeg, innerR, cx, cy);
  const span = ((endDeg - startDeg) % 360 + 360) % 360;
  const large = span > 180 ? 1 : 0;
  return [
    `M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `L ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
    `L ${p4.x.toFixed(3)} ${p4.y.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

export function wedgePathForPitchClass(
  pc: number,
  extraGapDeg = 0,
  innerR = NOTE_RING_R_IN,
  outerR = NOTE_RING_R_WEDGE,
): string {
  const { start, end } = wedgeAngles(pc, extraGapDeg);
  return wedgePath(start, end, innerR, outerR);
}

/** Inset copy of a sector — glass edge lives strictly inside the wedge. */
export function insetWedgePath(
  startDeg: number,
  endDeg: number,
  radiusPad = 2.1,
  extraGapDeg = 0.35,
): string {
  return wedgePath(
    startDeg + extraGapDeg,
    endDeg - extraGapDeg,
    NOTE_RING_R_IN + radiusPad,
    NOTE_RING_R_WEDGE - radiusPad,
  );
}

/** Doughnut clip so nothing can paint outside the ring. */
export function annulusClipPath(
  innerR = NOTE_RING_R_IN,
  outerR = NOTE_RING_R_WEDGE,
  cx = NOTE_RING_CX,
  cy = NOTE_RING_CY,
): string {
  return [
    `M ${cx} ${(cy - outerR).toFixed(3)}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx} ${(cy + outerR).toFixed(3)}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx} ${(cy - outerR).toFixed(3)}`,
    `M ${cx} ${(cy - innerR).toFixed(3)}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx} ${(cy + innerR).toFixed(3)}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx} ${(cy - innerR).toFixed(3)}`,
  ].join(" ");
}

export function shortestDegDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function lerpDeg(from: number, to: number, t: number): number {
  return from + shortestDegDelta(from, to) * t;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Pitch class 0–11 under a point, or null outside the annulus
 * (small rim slop for finger targeting only — drawing does not use this).
 */
export function pitchClassFromRingCoordinates(
  x: number,
  y: number,
  rimSlop = 8,
): number | null {
  const r = distFromCentre(x, y);
  if (r < NOTE_RING_R_IN - rimSlop || r > NOTE_RING_R_WEDGE + rimSlop) {
    return null;
  }
  const deg = (Math.atan2(y - NOTE_RING_CY, x - NOTE_RING_CX) * 180) / Math.PI;
  const t = (deg - NOTE_RING_ZERO_DEG + 360) % 360;
  return Math.min(11, Math.floor(t / NOTE_RING_STEP_DEG));
}

export function hubDiameterFrac(): number {
  return (2 * (NOTE_RING_R_IN - 1.5)) / NOTE_RING_SIZE;
}
