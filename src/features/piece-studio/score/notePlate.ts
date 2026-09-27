/**
 * Shared note-cue geometry for Practise feedback.
 * Listen playback uses `ScorePlaybackPlayhead`, not this plate.
 */

export const NOTE_PLATE_MIN = 24;
export const NOTE_PLATE_MAX = 32;
/** Listen / Practise underline width. */
export const LISTEN_UNDERLINE_MIN = 20;
export const LISTEN_UNDERLINE_MAX = 36;
/** Listen / Practise underline height. */
export const LISTEN_UNDERLINE_HEIGHT_MIN = 6;
export const LISTEN_UNDERLINE_HEIGHT_MAX = 10;
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
    Math.max(LISTEN_UNDERLINE_MIN, basisPx * 0.85),
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

/**
 * Practise note focus: underline under a staff-band wash rect.
 * Same language as Listen — never covers the notehead.
 */
export function shapeNoteFocusUnderline(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const basis = Math.max(rect.height, 28);
  const minWidth = listenUnderlineWidth(basis);
  const height = listenUnderlineHeight(basis);
  const width = Math.max(
    minWidth,
    Math.min(rect.width * 0.7, LISTEN_UNDERLINE_MAX * 1.55),
  );
  return {
    x: rect.x + Math.max(0, (rect.width - width) * 0.5),
    y: rect.y + rect.height * 0.88,
    width,
    height,
  };
}

/**
 * @deprecated Use shapeNoteFocusUnderline — Practise note cues are underlines.
 * Kept so older imports keep a stable name; now returns an under-note underline.
 */
export function shapeNotePlateRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return shapeNoteFocusUnderline(rect);
}
