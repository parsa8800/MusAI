import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";

/** Hard cap — never walk the engraved cursor unbounded on the main thread. */
export const PIECE_CURSOR_SNAPSHOT_MAX_STEPS = 2000;

export type CursorWalkIterator = {
  EndReached: boolean;
  currentTimeStamp?: { RealValue: number };
  CurrentSourceTimestamp?: { RealValue: number };
};

export type CursorWalkHandle = {
  reset: () => void;
  next: () => void;
  show: () => void;
  hide: () => void;
  update: () => void;
  cursorElement?: HTMLElement;
  Iterator?: CursorWalkIterator;
  iterator?: CursorWalkIterator;
};

function iteratorTime(it: CursorWalkIterator | undefined): number {
  if (!it) return 0;
  return (
    it.CurrentSourceTimestamp?.RealValue ??
    it.currentTimeStamp?.RealValue ??
    0
  );
}

function poseKey(tSec: number, x: number, y: number): string {
  return `${tSec.toFixed(4)}:${Math.round(x)}:${Math.round(y)}`;
}

/**
 * Walk an OSMD-style cursor into Listen playhead poses.
 * Guarantees termination even when the vendor iterator never sets EndReached.
 */
export function collectCursorSnapshotsFromWalk(
  cursor: CursorWalkHandle,
  wrap: HTMLElement,
  wholeNotesToSeconds: (wholeNotes: number) => number,
  maxSteps: number = PIECE_CURSOR_SNAPSHOT_MAX_STEPS,
): CursorPose[] {
  cursor.reset();
  cursor.show();
  const snaps: CursorPose[] = [];
  const wrapRect = wrap.getBoundingClientRect();
  let lastKey = "";
  let stagnant = 0;
  let lastTime = Number.NaN;

  for (let i = 0; i < maxSteps; i++) {
    // Re-read each step — OSMD may replace the iterator object after next().
    const it = cursor.Iterator ?? cursor.iterator;
    if (!it) break;

    cursor.update();
    const tWhole = iteratorTime(it);
    const tSec = wholeNotesToSeconds(tWhole);
    const el = cursor.cursorElement;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) {
        const x = r.left - wrapRect.left + wrap.scrollLeft;
        const y = r.top - wrapRect.top + wrap.scrollTop;
        snaps.push({ tSec, x, y, height: r.height });
        const key = poseKey(tSec, x, y);
        if (key === lastKey) {
          stagnant += 1;
        } else {
          stagnant = 0;
          lastKey = key;
        }
      }
    }

    if (it.EndReached) break;

    const before = tWhole;
    cursor.next();
    const itAfter = cursor.Iterator ?? cursor.iterator;
    const after = iteratorTime(itAfter);

    if (itAfter?.EndReached) break;

    // Vendor iterators sometimes never flip EndReached — stop when time stalls
    // or the visible pose stops changing.
    if (after === before || (Number.isFinite(lastTime) && after < lastTime)) {
      stagnant += 1;
    }
    lastTime = after;

    if (stagnant >= 3) break;
  }

  cursor.hide();
  return snaps;
}
