/**
 * Fit engraved scale notation inside a frame without clipping ink.
 * Scale uniformly; never crop stems, clefs, noteheads, or feedback marks.
 * When the exercise is dense, tighten spacing first, then scale.
 */

import {
  chunkMidisForStaff,
  maxNotesPerStaffRow,
  STAFF_NOTE_MIN_GAP_PX,
} from "@/lib/staffChunking";
import { STAVE_LINE_SPACING_PX } from "@/lib/vexflowScaleSpelling";

export type NotationInkBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type NotationViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClientBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type NotationEngravingPlan = {
  noteGapPx: number;
  maxPerRow: number;
  lineSpacingPx: number;
  noteHeadFontSize: number;
  inkPad: number;
  systemGapClass: string;
  systemCount: number;
};

/** Uniform scale that keeps content fully inside the available box. */
export function notationFitScale(
  availableWidth: number,
  availableHeight: number,
  contentWidth: number,
  contentHeight: number,
): number {
  if (
    availableWidth < 1 ||
    availableHeight < 1 ||
    contentWidth < 1 ||
    contentHeight < 1
  ) {
    return 1;
  }
  const scale = Math.min(
    1,
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  );
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.max(0.05, scale);
}

/**
 * ViewBox that keeps the original stave width and expands to any ink that
 * spilled past it (arrows, stems, clef). Does not crop horizontally inward.
 */
export function notationViewBoxFromInk(
  canvasWidth: number,
  bounds: NotationInkBounds,
  pad: number,
): NotationViewBox | null {
  const { minX, minY, maxX, maxY } = bounds;
  if (
    !(canvasWidth > 0) ||
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    maxX <= minX ||
    maxY <= minY
  ) {
    return null;
  }
  const safePad = Math.max(0, pad);
  const x = Math.min(0, minX - safePad);
  const y = minY - safePad;
  const right = Math.max(canvasWidth, maxX + safePad);
  const width = Math.ceil(right - x);
  const height = Math.ceil(maxY + safePad - y);
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

/** Collapse layout size after a CSS scale so overflow parents do not clip. */
export function notationFitLayoutShift(
  scale: number,
  contentWidth: number,
  contentHeight: number,
): { marginRight: number; marginBottom: number } {
  if (scale >= 0.995) return { marginRight: 0, marginBottom: 0 };
  return {
    marginRight: Math.round((scale - 1) * contentWidth),
    marginBottom: Math.round((scale - 1) * contentHeight),
  };
}

export function unionClientBoxes(boxes: ClientBox[]): ClientBox | null {
  if (boxes.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  if (!Number.isFinite(left) || right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

/** Scale from painted ink vs the host, with a small inset so marks are not on the clip edge. */
export function notationFitFromBoxes(
  host: ClientBox,
  content: ClientBox,
  inset = 2,
): number {
  const availW = host.right - host.left - inset * 2;
  const availH = host.bottom - host.top - inset * 2;
  return notationFitScale(
    availW,
    availH,
    content.right - content.left,
    content.bottom - content.top,
  );
}

const NOTE_GAP_STEPS = [STAFF_NOTE_MIN_GAP_PX, 30, 26, 22, 20] as const;

/**
 * Prefer keeping a phrase on one staff by tightening note gaps before
 * splitting at octaves. Never go so tight that heads collide.
 */
export function notationNoteGapForWidth(
  availableWidth: number,
  longestPhrase: number,
  preferredGap: number,
): number {
  const preferred = Math.max(20, preferredGap);
  const steps = [preferred, ...NOTE_GAP_STEPS.filter((g) => g < preferred)];
  for (const gap of steps) {
    if (maxNotesPerStaffRow(availableWidth, gap) >= Math.max(1, longestPhrase)) {
      return gap;
    }
  }
  return steps[steps.length - 1] ?? 20;
}

function estimateSystemHeight(lineSpacingPx: number, inkPad: number): number {
  // Five lines + stems (~3.2 spaces) + crop pad, both above and below.
  return lineSpacingPx * 9 + inkPad * 2;
}

/**
 * Pick engraving that fits the frame: tighten spacing before shrinking the
 * whole piece, and only then rely on a uniform scale.
 */
export function notationEngravingPlan(args: {
  availableWidth: number;
  availableHeight: number;
  ascendingMidis: number[];
  descendingMidis: number[];
  pad: boolean;
}): NotationEngravingPlan {
  const { availableWidth, availableHeight, ascendingMidis, descendingMidis, pad } =
    args;
  const both = ascendingMidis.length > 0 && descendingMidis.length > 0;
  const longPhrase = Math.max(ascendingMidis.length, descendingMidis.length) > 10;
  const longest = Math.max(ascendingMidis.length, descendingMidis.length, 1);
  const preferredGap = pad ? (both ? 28 : 36) : STAFF_NOTE_MIN_GAP_PX;
  const noteGapPx = notationNoteGapForWidth(
    availableWidth,
    longest,
    preferredGap,
  );
  const maxPerRow = maxNotesPerStaffRow(availableWidth, noteGapPx);
  const ascSystems = chunkMidisForStaff(ascendingMidis, maxPerRow).length;
  const descSystems = chunkMidisForStaff(descendingMidis, maxPerRow).length;
  const systemCount = Math.max(1, ascSystems + descSystems);

  const comfortableSpacing = pad
    ? both
      ? longPhrase
        ? 14
        : 16
      : longPhrase
        ? 16
        : 18
    : STAVE_LINE_SPACING_PX;
  const comfortableHeads = pad
    ? both
      ? longPhrase
        ? 34
        : 38
      : longPhrase
        ? 36
        : 42
    : 39;
  const comfortablePad = pad ? (longPhrase && both ? 22 : 20) : 28;

  let lineSpacingPx = comfortableSpacing;
  let noteHeadFontSize = comfortableHeads;
  let inkPad = comfortablePad;
  let compactGaps = systemCount > 2;

  const heightBudget = Math.max(0, availableHeight);
  if (heightBudget >= 48) {
    const gapPx = compactGaps ? 16 : longPhrase ? 36 : 20;
    const need =
      systemCount * estimateSystemHeight(lineSpacingPx, inkPad) +
      Math.max(0, systemCount - 1) * gapPx;
    if (need > heightBudget) {
      lineSpacingPx = Math.max(12, lineSpacingPx - 2);
      noteHeadFontSize = Math.max(28, noteHeadFontSize - 4);
      inkPad = Math.max(14, inkPad - 4);
      compactGaps = true;
    }
    const need2 =
      systemCount * estimateSystemHeight(lineSpacingPx, inkPad) +
      Math.max(0, systemCount - 1) * (compactGaps ? 12 : 20);
    if (need2 > heightBudget) {
      lineSpacingPx = Math.max(12, lineSpacingPx - 2);
      noteHeadFontSize = Math.max(28, noteHeadFontSize - 4);
      inkPad = Math.max(12, inkPad - 4);
      compactGaps = true;
    }
  }

  const systemGapClass =
    systemCount <= 1
      ? "gap-0"
      : compactGaps
        ? pad
          ? "gap-2 sm:gap-3"
          : "gap-3 sm:gap-4"
        : longPhrase
          ? pad
            ? "gap-5 sm:gap-6"
            : "gap-6 sm:gap-8"
          : pad
            ? "gap-3 sm:gap-4"
            : "gap-3 sm:gap-4";

  return {
    noteGapPx,
    maxPerRow,
    lineSpacingPx,
    noteHeadFontSize,
    inkPad,
    systemGapClass,
    systemCount,
  };
}
