import { notePlateFromPose } from "@/features/piece-studio/score/notePlate";

export type CursorPose = {
  tSec: number;
  x: number;
  y: number;
  height: number;
};

export type CursorBand = CursorPose & {
  /** Width of the current-note highlight (px). */
  width: number;
  /** Optional softer measure emphasis behind the note (unused on Listen). */
  measureWidth?: number;
  measureX?: number;
};

function systemBreak(a: CursorPose, b: CursorPose): boolean {
  return Math.abs(b.y - a.y) > Math.max(a.height, b.height, 24) * 0.45;
}

/** Musical-time interpolation. Does not cross systems diagonally. */
export function interpolateCursor(
  snaps: CursorPose[],
  tSec: number,
): CursorPose | null {
  if (snaps.length === 0) return null;
  if (tSec <= snaps[0]!.tSec) return snaps[0]!;
  const last = snaps[snaps.length - 1]!;
  if (tSec >= last.tSec) return last;
  let i = 0;
  while (i + 1 < snaps.length && snaps[i + 1]!.tSec <= tSec) i += 1;
  const a = snaps[i]!;
  const b = snaps[i + 1];
  if (!b) return a;
  if (systemBreak(a, b)) return a;
  const span = b.tSec - a.tSec;
  const u = span > 1e-6 ? (tSec - a.tSec) / span : 0;
  return {
    tSec,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    height: a.height + (b.height - a.height) * u,
  };
}

/**
 * Playhead note plate (shared geometry with Practise heat).
 * Holds on the sounding note — no smear between heads, no karaoke bar.
 */
export function interpolateCursorBand(
  snaps: CursorPose[],
  tSec: number,
): CursorBand | null {
  if (snaps.length === 0) return null;
  let pose = snaps[0]!;
  if (tSec > pose.tSec) {
    let i = 0;
    while (i + 1 < snaps.length && snaps[i + 1]!.tSec <= tSec) i += 1;
    pose = snaps[i]!;
  }
  const plate = notePlateFromPose(pose);
  return {
    ...pose,
    tSec,
    x: plate.x,
    y: plate.y,
    width: plate.width,
    height: plate.height,
  };
}

/** Map a click in score coordinates to the nearest cursor snapshot time. */
export function pickCursorTime(
  snaps: CursorPose[],
  x: number,
  y: number,
): number | null {
  if (snaps.length === 0) return null;
  let best = snaps[0]!;
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of snaps) {
    const inSystem = y >= s.y - 12 && y <= s.y + s.height + 12;
    const dy = inSystem ? 0 : Math.abs(y - (s.y + s.height / 2));
    const dx = Math.abs(x - s.x);
    const d = dy * 4 + dx;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best.tSec;
}
