/**
 * Shared note-plate geometry for Listen playhead and Practise note heat.
 * Practise: tight square on the notehead.
 * Listen: short underline below the notehead — never covers the note.
 */

export const NOTE_PLATE_MIN = 24;
export const NOTE_PLATE_MAX = 32;
/** Listen underline width. */
export const LISTEN_UNDERLINE_MIN = 18;
export const LISTEN_UNDERLINE_MAX = 30;
/** Listen underline height. */
export const LISTEN_UNDERLINE_HEIGHT_MIN = 7;
export const LISTEN_UNDERLINE_HEIGHT_MAX = 11;
/** @deprecated Prefer NOTE_PLATE_MIN — kept for older test imports. */
export const NOTE_PLATE_MIN_HEIGHT = NOTE_PLATE_MIN;
/** @deprecated Use LISTEN_UNDERLINE_* — kept for older imports. */
export const LISTEN_BEAM_MIN = LISTEN_UNDERLINE_MIN;
/** @deprecated Use LISTEN_UNDERLINE_* — kept for older imports. */
export const LISTEN_BEAM_MAX = LISTEN_UNDERLINE_MAX;
/** @deprecated Use LISTEN_UNDERLINE_* — kept for older imports. */
export const LISTEN_PLATE_MIN = LISTEN_UNDERLINE_MIN;
/** @deprecated Use LISTEN_UNDERLINE_* — kept for older imports. */
export const LISTEN_PLATE_MAX = 52;

export function notePlateSize(basisPx: number): number {
  return Math.min(NOTE_PLATE_MAX, Math.max(NOTE_PLATE_MIN, basisPx * 0.36));
}

export function listenUnderlineWidth(basisPx: number): number {
  return Math.min(
    LISTEN_UNDERLINE_MAX,
    Math.max(LISTEN_UNDERLINE_MIN, basisPx * 0.7),
  );
}

export function listenUnderlineHeight(basisPx: number): number {
  return Math.min(
    LISTEN_UNDERLINE_HEIGHT_MAX,
    Math.max(LISTEN_UNDERLINE_HEIGHT_MIN, basisPx * 0.18),
  );
}

/** @deprecated Use notePlateSize — width and height share one size. */
export function notePlateWidth(basisPx: number): number {
  return notePlateSize(basisPx);
}

/**
 * Listen underline — sits under the notehead so the note stays fully readable.
 */
export function notePlateFromPose(pose: {
  x: number;
  y: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const width = listenUnderlineWidth(pose.height);
  const height = listenUnderlineHeight(pose.height);
  return {
    x: Math.max(0, pose.x - width * 0.5),
    // Below the notehead / staff band centre — never over the oval.
    y: pose.y + pose.height * 0.78,
    width,
    height,
  };
}

/** Practise: same square, centred in an overlay rect that spans the staff. */
export function shapeNotePlateRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const size = notePlateSize(Math.max(rect.height, rect.width * 0.5));
  return {
    x: rect.x + Math.max(0, (rect.width - size) * 0.5),
    y: rect.y + Math.max(0, (rect.height - size) * 0.4),
    width: size,
    height: size,
  };
}
