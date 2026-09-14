import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";

export type ScoreOverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function systemBreak(a: CursorPose, b: CursorPose): boolean {
  return Math.abs(b.y - a.y) > Math.max(a.height, b.height, 24) * 0.45;
}

function nearestSnap(snaps: readonly CursorPose[], tSec: number): CursorPose {
  let best = snaps[0]!;
  let bestD = Math.abs(best.tSec - tSec);
  for (const snap of snaps) {
    const d = Math.abs(snap.tSec - tSec);
    if (d < bestD) {
      best = snap;
      bestD = d;
    }
  }
  return best;
}

/**
 * Map a musical-time window onto score-space washes, grouped by staff system.
 * Lives next to OSMD so feedback analyzers never depend on overlay math.
 */
export function overlayRectsForRange(
  snaps: readonly CursorPose[],
  startSec: number,
  endSec: number,
): ScoreOverlayRect[] {
  if (snaps.length === 0) return [];
  const lo = Math.min(startSec, endSec);
  const hi = Math.max(startSec, endSec);
  const pad = 0.05;
  let selected = snaps.filter(
    (snap) => snap.tSec + pad >= lo && snap.tSec - pad <= hi,
  );
  if (selected.length === 0) {
    selected = [nearestSnap(snaps, lo)];
  }

  const groups: CursorPose[][] = [];
  for (const snap of selected) {
    const group = groups.find((g) => g[0] && !systemBreak(g[0], snap));
    if (group) group.push(snap);
    else groups.push([snap]);
  }

  return groups.map((group) => {
    const xs = group.map((s) => s.x);
    const ys = group.map((s) => s.y);
    const bottoms = group.map((s) => s.y + s.height);
    const x0 = Math.min(...xs) - 8;
    const x1 = Math.max(...xs) + 22;
    const y = Math.min(...ys) - 6;
    return {
      x: x0,
      y,
      width: Math.max(32, x1 - x0),
      height: Math.max(28, Math.max(...bottoms) - y + 6),
    };
  });
}
