import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import type { CursorWalkSample } from "@/features/piece-studio/score/cursorNoteAlign";

export type { CursorWalkSample } from "@/features/piece-studio/score/cursorNoteAlign";

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
  /** OSMD: notes at the current iterator position (preferred filter). */
  NotesUnderCursor?: (instrument?: unknown) => readonly unknown[];
  notesUnderCursor?: (instrument?: unknown) => readonly unknown[];
  SkipInvisibleNotes?: boolean;
};

/** Width OSMD engraved against (pre-fit). Needed to map cursor CSS px → display. */
export type CursorSnapshotLayout = {
  paintWidthPx: number;
};

function iteratorTime(it: CursorWalkIterator | undefined): number {
  if (!it) return 0;
  return (
    it.CurrentSourceTimestamp?.RealValue ??
    it.currentTimeStamp?.RealValue ??
    0
  );
}

/** True when OSMD reports at least one sounding note here (skip clef / barline / rests). */
export function cursorHasSoundingNotes(cursor: CursorWalkHandle): boolean {
  const read = cursor.NotesUnderCursor ?? cursor.notesUnderCursor;
  if (typeof read !== "function") return true;
  try {
    const notes = read.call(cursor);
    if (!notes || typeof notes.length !== "number") return true;
    if (notes.length === 0) return false;
    for (let i = 0; i < notes.length; i++) {
      if (!noteLooksLikeRest(notes[i])) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function noteLooksLikeRest(n: unknown): boolean {
  if (!n || typeof n !== "object") return false;
  const obj = n as {
    isRest?: boolean | (() => boolean);
    IsRest?: boolean;
  };
  if (typeof obj.isRest === "function") {
    try {
      return Boolean(obj.isRest.call(n));
    } catch {
      return false;
    }
  }
  return obj.isRest === true || obj.IsRest === true;
}

export type CursorWalkOptions = {
  /** Keep walking until we have this many note samples when possible. */
  targetNoteCount?: number;
};

/**
 * OSMD's Cursor.update() returns immediately while `hidden` is true.
 * Always show() before measuring; prefer live layout box, then style height.
 */
function readCursorBox(el: HTMLElement | null | undefined): {
  left: number;
  top: number;
  height: number;
} | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  let height = r.height;
  if (height < 1) {
    height = el.offsetHeight || Number.parseFloat(el.style.height) || 0;
  }
  if (height < 1) return null;
  return { left: r.left, top: r.top, height };
}

function readEngraverStyle(el: HTMLElement): {
  left: number;
  top: number;
  height: number;
} | null {
  const candidates: HTMLElement[] = [el];
  try {
    const list = el.querySelectorAll?.('[id^="cursorImg"]');
    if (list && typeof list.length === "number") {
      for (let i = 0; i < list.length; i++) {
        const child = list.item(i);
        if (child instanceof HTMLElement) candidates.push(child);
      }
    }
  } catch {
    /* mock cursors in unit tests */
  }
  if (el.firstElementChild instanceof HTMLElement) {
    candidates.push(el.firstElementChild);
  }
  for (const node of candidates) {
    const left = Number.parseFloat(node.style?.left ?? "");
    if (!Number.isFinite(left)) continue;
    const top = Number.parseFloat(node.style?.top ?? "");
    const height = Number.parseFloat(node.style?.height ?? "");
    return {
      left,
      top: Number.isFinite(top) ? top : 0,
      height: Number.isFinite(height) ? height : 0,
    };
  }
  return null;
}

/**
 * Map OSMD cursor coordinates into wrap overlay space.
 *
 * After fitOsmdHostToContent, the SVG is shrink-wrapped but OSMD still writes
 * cursor `left`/`top` in the pre-fit paint width. Using getBoundingClientRect
 * alone then places the playhead in empty stage to the right of the music.
 */
export function poseFromOsmdCursorElement(
  el: HTMLElement,
  wrap: HTMLElement,
  paintWidthPx: number,
): { x: number; y: number; height: number } | null {
  const wrapRect = wrap.getBoundingClientRect();
  const closest =
    typeof el.closest === "function"
      ? el.closest.bind(el)
      : ((_sel: string) => null);
  const host =
    (closest(".musai-piece-osmd") as HTMLElement | null) ??
    (typeof wrap.querySelector === "function"
      ? (wrap.querySelector(".musai-piece-osmd") as HTMLElement | null)
      : null);
  const svg =
    host?.querySelector?.("svg") ??
    (typeof wrap.querySelector === "function"
      ? (wrap.querySelector("svg") as SVGSVGElement | null)
      : null);
  const page =
    (closest('[id^="osmdCanvasPage"]') as HTMLElement | null) ??
    (svg?.parentElement as HTMLElement | null);

  const svgRect = svg?.getBoundingClientRect();
  const pageRect = page?.getBoundingClientRect();
  const style = readEngraverStyle(el);
  const box = readCursorBox(el);

  let engraverX: number | null = style?.left ?? null;
  let engraverY: number | null = style?.top ?? null;
  if (engraverX == null && box && pageRect) {
    engraverX = box.left - pageRect.left;
  }
  if (engraverY == null && box && pageRect) {
    engraverY = box.top - pageRect.top;
  }
  if (engraverX == null || engraverY == null) {
    // Unit tests / missing OSMD page structure — use screen box in wrap space.
    if (!box) return null;
    return {
      x: box.left - wrapRect.left + wrap.scrollLeft,
      y: box.top - wrapRect.top + wrap.scrollTop,
      height: Math.max(box.height, 24),
    };
  }

  const paintW =
    paintWidthPx > 1
      ? paintWidthPx
      : pageRect && pageRect.width > 1
        ? pageRect.width
        : svgRect?.width ?? 0;
  const displayW = svgRect?.width ?? pageRect?.width ?? paintW;
  const scale = paintW > 1 ? displayW / paintW : 1;

  const originLeft = svgRect
    ? svgRect.left - wrapRect.left + wrap.scrollLeft
    : pageRect
      ? pageRect.left - wrapRect.left + wrap.scrollLeft
      : 0;
  const originTop = svgRect
    ? svgRect.top - wrapRect.top + wrap.scrollTop
    : pageRect
      ? pageRect.top - wrapRect.top + wrap.scrollTop
      : 0;

  let height =
    (style && style.height > 1 ? style.height : box && box.height > 1 ? box.height : 0) *
    scale;
  if (height < 8) {
    height = Math.max(34, (svgRect?.height ?? 48) * 0.72);
  }

  let x = originLeft + engraverX * scale;
  let y = originTop + engraverY * scale;

  if (svgRect && svgRect.width > 8) {
    const minX = originLeft + 2;
    const maxX = originLeft + svgRect.width - 10;
    x = Math.min(maxX, Math.max(minX, x));
    const minY = originTop;
    const maxY = originTop + Math.max(0, svgRect.height - height);
    y = Math.min(maxY, Math.max(minY, y));
  }

  return { x, y, height };
}

/**
 * Walk an OSMD-style cursor into position samples.
 * Times stay as engraver RealValue — bind to MusaiScore note seconds later.
 * Guarantees termination even when the vendor iterator never sets EndReached.
 */
export function collectCursorWalkSamples(
  cursor: CursorWalkHandle,
  wrap: HTMLElement,
  layout: CursorSnapshotLayout = { paintWidthPx: 0 },
  maxSteps: number = PIECE_CURSOR_SNAPSHOT_MAX_STEPS,
  options: CursorWalkOptions = {},
): CursorWalkSample[] {
  const target = options.targetNoteCount ?? 0;
  try {
    if ("SkipInvisibleNotes" in cursor) cursor.SkipInvisibleNotes = true;
  } catch {
    /* optional */
  }

  // show() first — reset()/update() are no-ops while the OSMD cursor is hidden.
  cursor.show();
  cursor.reset();
  cursor.show();
  cursor.update();

  const samples: CursorWalkSample[] = [];
  let timeStalls = 0;
  let lastTime = Number.NaN;
  let lastPoseKey = "";

  const pushPose = (realValue: number, pose: { x: number; y: number; height: number }) => {
    const key = `${realValue.toFixed(4)}:${Math.round(pose.x)}:${Math.round(pose.y)}`;
    if (key === lastPoseKey) return;
    samples.push({
      realValue,
      x: pose.x,
      y: pose.y,
      height: pose.height,
    });
    lastPoseKey = key;
  };

  for (let i = 0; i < maxSteps; i++) {
    const it = cursor.Iterator ?? cursor.iterator;
    if (!it) break;

    cursor.update();
    const realValue = iteratorTime(it);
    const el = cursor.cursorElement;
    // Skip clef / time-signature / empty iterator stops when OSMD exposes notes.
    if (el && cursorHasSoundingNotes(cursor)) {
      const pose = poseFromOsmdCursorElement(el, wrap, layout.paintWidthPx);
      if (pose) pushPose(realValue, pose);
    }

    if (it.EndReached) break;
    if (target > 0 && samples.length >= target) break;

    const before = realValue;
    cursor.next();
    const itAfter = cursor.Iterator ?? cursor.iterator;
    const after = iteratorTime(itAfter);

    if (itAfter?.EndReached) {
      cursor.update();
      const elFinal = cursor.cursorElement;
      if (elFinal && cursorHasSoundingNotes(cursor)) {
        const pose = poseFromOsmdCursorElement(
          elFinal,
          wrap,
          layout.paintWidthPx,
        );
        if (pose) pushPose(iteratorTime(itAfter), pose);
      }
      break;
    }

    // Time can stall across invisible entries — only abort when we are not
    // still short of the expected note count.
    if (after === before || (Number.isFinite(lastTime) && after < lastTime)) {
      timeStalls += 1;
    } else {
      timeStalls = 0;
    }
    lastTime = after;
    const stallLimit = target > 0 && samples.length < target ? 24 : 6;
    if (timeStalls >= stallLimit) break;
  }

  cursor.hide();
  return samples;
}

/**
 * Walk + convert with wholeNotesToSeconds only (no note binding).
 * Prefer alignCursorSamplesToNotes with playback notes for Listen accuracy.
 */
export function collectCursorSnapshotsFromWalk(
  cursor: CursorWalkHandle,
  wrap: HTMLElement,
  wholeNotesToSeconds: (wholeNotes: number) => number,
  layout: CursorSnapshotLayout = { paintWidthPx: 0 },
  maxSteps: number = PIECE_CURSOR_SNAPSHOT_MAX_STEPS,
): CursorPose[] {
  return collectCursorWalkSamples(cursor, wrap, layout, maxSteps).map(
    (sample) => ({
      tSec: wholeNotesToSeconds(sample.realValue),
      x: sample.x,
      y: sample.y,
      height: sample.height,
    }),
  );
}

