import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import { notePlateFromPose } from "@/features/piece-studio/score/notePlate";
import {
  staffBandForNoteGroup,
  type StaffBand,
} from "@/features/piece-studio/score/staffBands";

export type ScoreOverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * True only when poses sit on different systems — not for pitch leaps on the
 * same staff (those used to split washes and mis-place highlights).
 */
function systemBreak(a: CursorPose, b: CursorPose): boolean {
  const dy = Math.abs(b.y - a.y);
  // Within one staff (incl. ledger) heads span ~1 staff height; systems jump more.
  const staffish = Math.max(a.height, b.height, 12) * 4 + 28;
  return dy > staffish;
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

function snapsInRange(
  snaps: readonly CursorPose[],
  startSec: number,
  endSec: number,
): CursorPose[] {
  if (snaps.length === 0) return [];
  const lo = Math.min(startSec, endSec);
  const hi = Math.max(startSec, endSec);
  // Tiny epsilon only — avoid pulling neighbouring notes into the wash.
  const pad = 0.012;
  let selected = snaps.filter(
    (snap) => snap.tSec + pad >= lo && snap.tSec - pad <= hi,
  );
  if (selected.length === 0) {
    selected = [nearestSnap(snaps, lo)];
  }
  return selected;
}

/** Half the engraved notehead width (falls back from oval height). */
function noteHalfWidth(snap: CursorPose): number {
  if (typeof snap.width === "number" && snap.width > 0) {
    return snap.width * 0.5;
  }
  return Math.max(5, Math.min(9, (snap.height || 12) * 0.48));
}

/**
 * Map a musical-time window onto score-space washes, grouped by staff system.
 * Horizontal edges hug the first/last noteheads; vertical span follows the
 * engraved staff band so pitch leaps never stretch the highlight.
 */
export function overlayRectsForRange(
  snaps: readonly CursorPose[],
  startSec: number,
  endSec: number,
  staffBands: readonly StaffBand[] = [],
): ScoreOverlayRect[] {
  const selected = snapsInRange(snaps, startSec, endSec);
  if (selected.length === 0) return [];

  const groups: CursorPose[][] = [];
  for (const snap of selected) {
    const group = groups.find((g) => g[0] && !systemBreak(g[0], snap));
    if (group) group.push(snap);
    else groups.push([snap]);
  }

  return groups.map((group) => {
    const centers = group.map((s) => s.y + s.height * 0.5);
    const noteMid =
      centers.reduce((sum, y) => sum + y, 0) / Math.max(1, centers.length);
    const rawHeights = group.map((s) => s.height);
    const maxSnapH = Math.max(...rawHeights, 0);
    const looksLikeNoteheads = maxSnapH > 0 && maxSnapH < 28;

    const leftEdge = Math.min(
      ...group.map((s) => s.x - noteHalfWidth(s)),
    );
    const rightEdge = Math.max(
      ...group.map((s) => s.x + noteHalfWidth(s)),
    );
    const band = staffBandForNoteGroup(
      staffBands,
      noteMid,
      leftEdge,
      rightEdge,
    );

    let y: number;
    let height: number;
    if (band) {
      y = band.y;
      height = band.height;
    } else if (!looksLikeNoteheads && maxSnapH >= 28) {
      y = Math.min(...group.map((s) => s.y));
      height = maxSnapH;
    } else {
      const space = Math.max(8, Math.min(16, maxSnapH || 12));
      height = space * 4;
      y = noteMid - height * 0.5;
    }

    // Small breathing room past the oval — not a wide bar pad.
    const edgePad = Math.max(2, Math.min(5, height * 0.06));
    const x0 = leftEdge - edgePad;
    const x1 = rightEdge + edgePad;
    return {
      x: x0,
      y,
      width: Math.max(x1 - x0, noteHalfWidth(group[0]!) * 2),
      height: Math.max(24, height),
    };
  });
}

/**
 * One underline per note pose in the window — sits under the head so the
 * notation stays readable and the spot is obvious.
 */
export function overlayNoteUnderlinesForRange(
  snaps: readonly CursorPose[],
  startSec: number,
  endSec: number,
): ScoreOverlayRect[] {
  const selected = snapsInRange(snaps, startSec, endSec);
  if (selected.length === 0) return [];

  const marks: ScoreOverlayRect[] = [];
  for (const snap of selected) {
    const plate = notePlateFromPose(snap);
    const prev = marks[marks.length - 1];
    if (
      prev &&
      Math.abs(prev.x - plate.x) < 6 &&
      Math.abs(prev.y - plate.y) < 6
    ) {
      continue;
    }
    marks.push(plate);
  }
  return marks;
}

/**
 * Bar wash: just below the top staff line and just above the bottom staff
 * line — never spilling past either edge. Keeps the caller’s horizontal
 * note-aligned span (no forced min-width that drifts off the notes).
 *
 * Rhythm passes `staffOutset` so the box sits a fixed margin outside the
 * five staff lines. That margin is a fraction of the staff height, so high
 * or low notes do not change the frame.
 */
export function shapePassageUnderlay(
  rect: ScoreOverlayRect,
  style: "heat" | "measure" | "note",
  options?: { staffOutset?: boolean },
): ScoreOverlayRect {
  const staffTop = rect.y;
  const staffH = Math.max(rect.height, 24);
  const staffBottom = staffTop + staffH;
  if (options?.staffOutset) {
    const padY = staffH * 0.12;
    const padX = staffH * 0.25;
    return {
      x: rect.x - padX,
      y: staffTop - padY,
      width: Math.max(8, rect.width + padX * 2),
      height: staffH + padY * 2,
    };
  }
  const insetY = Math.max(
    2.5,
    style === "measure" ? staffH * 0.1 : style === "heat" ? staffH * 0.09 : staffH * 0.11,
  );
  // Keep the caller’s note-aligned span — no extra side inset that eats into heads.
  const insetX = 0;
  const y = Math.max(0, staffTop + insetY);
  const maxBottom = staffBottom - insetY;
  const height = Math.max(12, maxBottom - y);
  return {
    x: Math.max(0, rect.x + insetX),
    y,
    width: Math.max(8, rect.width - insetX * 2),
    height,
  };
}
