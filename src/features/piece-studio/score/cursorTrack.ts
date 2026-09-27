export type CursorPose = {
  tSec: number;
  /**
   * When the sounding note ends. The playhead holds `x` until this time,
   * then glides to the next attack (rests, long notes).
   */
  endSec?: number;
  /** Notehead centre x in wrap coordinates. */
  x: number;
  y: number;
  height: number;
  /** Engraved notehead width when known — used for tight highlight edges. */
  width?: number;
};

function systemBreak(a: CursorPose, b: CursorPose): boolean {
  // Staff-sized jumps only — pitch leaps on one staff must not freeze the head.
  const dy = Math.abs(b.y + b.height * 0.5 - (a.y + a.height * 0.5));
  // Notehead poses are ~10px tall; floor at a real staff so leaps stay on-system.
  const staff = Math.max(a.height, b.height, 44);
  if (dy > staff * 1.6 + 28) return true;
  return b.x + 40 < a.x && dy > staff * 0.55;
}

/**
 * Last snap at or before `tSec` (binary search). Returns 0 when before the first.
 */
function poseIndexAtOrBefore(snaps: readonly CursorPose[], tSec: number): number {
  let lo = 0;
  let hi = snaps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (snaps[mid]!.tSec <= tSec) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Musical-time interpolation. Does not cross systems diagonally. */
export function interpolateCursor(
  snaps: readonly CursorPose[],
  tSec: number,
): CursorPose | null {
  if (snaps.length === 0) return null;
  if (tSec <= snaps[0]!.tSec) return { ...snaps[0]!, tSec: snaps[0]!.tSec };
  const last = snaps[snaps.length - 1]!;
  if (tSec >= last.tSec) return { ...last, tSec: last.tSec };

  const i = poseIndexAtOrBefore(snaps, tSec);
  const a = snaps[i]!;
  const b = snaps[i + 1];
  if (!b) return { ...a, tSec };

  // Different system — do not smear diagonally; playhead waypoints handle line ends.
  if (systemBreak(a, b)) return { ...a, tSec };

  const span = b.tSec - a.tSec;
  const u = span > 1e-6 ? (tSec - a.tSec) / span : 0;
  const aw = a.width;
  const bw = b.width;
  return {
    tSec,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    height: a.height + (b.height - a.height) * u,
    width:
      aw != null && bw != null
        ? aw + (bw - aw) * u
        : (aw ?? bw),
  };
}

function groupCursorSystems(snaps: readonly CursorPose[]): CursorPose[][] {
  if (snaps.length === 0) return [];
  const systems: CursorPose[][] = [[snaps[0]!]];
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1]!;
    const next = snaps[i]!;
    if (systemBreak(prev, next)) {
      systems.push([]);
    }
    systems[systems.length - 1]!.push(next);
  }
  return systems;
}

function pickSystemForClick(
  systems: readonly CursorPose[][],
  y: number,
): CursorPose[] {
  if (systems.length === 0) return [];
  let best = systems[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const system of systems) {
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const s of system) {
      top = Math.min(top, s.y);
      bottom = Math.max(bottom, s.y + s.height);
    }
    const center = (top + bottom) / 2;
    const dist = Math.abs(y - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = system;
    }
  }
  return best;
}

/**
 * Map horizontal click position to the nearest attack on this system.
 * Clicks left of the first note (time sig, clef, bar start) snap to the start.
 */
function pickTimeByX(system: readonly CursorPose[], x: number): number {
  if (system.length === 0) return 0;
  const byX = [...system].sort((a, b) => a.x - b.x);
  const first = byX[0]!;
  if (x <= first.x) return first.tSec;

  for (let i = 0; i < byX.length - 1; i++) {
    const a = byX[i]!;
    const b = byX[i + 1]!;
    if (x < a.x) return a.tSec;
    if (x <= b.x) {
      return x - a.x <= b.x - x ? a.tSec : b.tSec;
    }
  }
  return byX[byX.length - 1]!.tSec;
}

/**
 * Map a click in score coordinates to playback time.
 * Uses the staff row under the pointer, then horizontal bar position — not
 * nearest notehead (ledger-line notes must not steal clicks near the time sig).
 */
export function pickCursorTime(
  snaps: readonly CursorPose[],
  x: number,
  y: number,
): number | null {
  if (snaps.length === 0) return null;
  const systems = groupCursorSystems(snaps);
  const system = pickSystemForClick(systems, y);
  return pickTimeByX(system, x);
}
