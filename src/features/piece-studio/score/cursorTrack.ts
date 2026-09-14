export type CursorPose = {
  tSec: number;
  x: number;
  y: number;
  height: number;
};

export type CursorBand = CursorPose & {
  /** Width of the current-note highlight (px). */
  width: number;
  /** Optional softer measure emphasis behind the note. */
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
 * Playhead pose plus a soft band covering the active note span, with a
 * slightly wider measure-ish emphasis derived from neighbouring snapshots.
 */
export function interpolateCursorBand(
  snaps: CursorPose[],
  tSec: number,
): CursorBand | null {
  const pose = interpolateCursor(snaps, tSec);
  if (!pose) return null;
  if (snaps.length === 0) return { ...pose, width: 18 };

  let i = 0;
  while (i + 1 < snaps.length && snaps[i + 1]!.tSec <= tSec) i += 1;
  const a = snaps[i]!;
  const b = snaps[i + 1];

  // Note width from neighbouring attacks on the same system.
  let noteWidth = 18;
  if (b && !systemBreak(a, b)) {
    noteWidth = Math.max(14, Math.min(48, b.x - a.x));
  } else if (i > 0) {
    const prev = snaps[i - 1]!;
    if (!systemBreak(prev, a)) {
      noteWidth = Math.max(14, Math.min(48, a.x - prev.x));
    }
  }

  // Measure emphasis: stretch toward nearby snaps that share this system.
  let left = a.x;
  let right = a.x + noteWidth;
  for (let j = i; j >= 0; j--) {
    const s = snaps[j]!;
    if (systemBreak(s, a)) break;
    if (Math.abs(s.tSec - a.tSec) > 2.4) break;
    left = Math.min(left, s.x);
  }
  for (let j = i; j < snaps.length; j++) {
    const s = snaps[j]!;
    if (systemBreak(a, s)) break;
    if (Math.abs(s.tSec - a.tSec) > 2.4) break;
    right = Math.max(right, s.x + 12);
  }
  const measureWidth = Math.max(noteWidth, Math.min(220, right - left));

  return {
    ...pose,
    // Prefer note-sized band; CSS draws a softer measure layer behind it.
    width: noteWidth,
    x: pose.x,
    measureWidth,
    measureX: left,
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
