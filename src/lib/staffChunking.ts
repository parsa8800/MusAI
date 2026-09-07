/**
 * Split a sequence of notes into staff systems so each row keeps minimum
 * horizontal spacing between note heads (musical spacing, not even squash).
 */
/** Slightly tighter than a raw 30px heuristic so 15-note lines fit more layouts. */
export const STAFF_NOTE_MIN_GAP_PX = 28;
export const STAFF_CLEF_ZONE_PX = 54;
export const STAFF_RIGHT_MARGIN_PX = 28;

/**
 * Two-octave ascending scales are 15 notes (tonic → upper tonic); descending is 14.
 * Cap must allow 15 on one system when width permits, or ascending wraps while
 * descending does not. See `chunkMidisForStaffPaired`.
 */
export const MAX_NOTES_PER_STAFF_ROW_CAP = 15;

export function maxNotesPerStaffRow(
  usableWidthPx: number,
  noteGapPx: number = STAFF_NOTE_MIN_GAP_PX,
): number {
  const gap = Math.max(18, noteGapPx);
  const inner = usableWidthPx - STAFF_CLEF_ZONE_PX - STAFF_RIGHT_MARGIN_PX;
  if (inner <= gap) return 2;
  const fromWidth = Math.max(2, Math.floor(inner / gap) + 1);
  return Math.min(fromWidth, MAX_NOTES_PER_STAFF_ROW_CAP);
}

/** Split `midis` into `rowCount` contiguous, length-balanced rows (sheet-music style). */
export function chunkMidisIntoBalancedRows(
  midis: number[],
  rowCount: number,
): number[][] {
  if (midis.length === 0 || rowCount <= 0) return [];
  const n = midis.length;
  const rows = Math.min(rowCount, n);
  if (rows === 1) return [midis];

  const base = Math.floor(n / rows);
  const remainder = n % rows;
  const chunks: number[][] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const size = base + (r < remainder ? 1 : 0);
    chunks.push(midis.slice(idx, idx + size));
    idx += size;
  }
  return chunks;
}

export function chunkMidisForStaff(
  midis: number[],
  maxPerRow: number,
): number[][] {
  if (midis.length === 0) return [];

  const n = midis.length;
  const minPerRow = 3;

  let rows = Math.max(1, Math.ceil(n / Math.max(1, maxPerRow)));
  // If we can reduce the number of rows (without exceeding maxPerRow),
  // do so to avoid staff lines with only 1–2 notes.
  while (
    rows > 1 &&
    Math.floor(n / rows) < minPerRow &&
    Math.ceil(n / (rows - 1)) <= maxPerRow
  ) {
    rows -= 1;
  }

  const chunks = chunkMidisIntoBalancedRows(midis, rows);

  // Final safety: if the last row is still very short, borrow from the previous row.
  // This can happen in edge cases when maxPerRow is tight.
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1]!;
    const prev = chunks[chunks.length - 2]!;
    while (last.length < minPerRow && prev.length > minPerRow) {
      last.unshift(prev.pop()!);
    }
  }

  return chunks;
}

/**
 * Ascending vs descending often differ by one note (peak only once). Use the same
 * number of staff lines for both so layout stays visually matched.
 */
export function chunkMidisForStaffPaired(
  ascendingMidis: number[],
  descendingMidis: number[],
  maxPerRow: number,
): { ascending: number[][]; descending: number[][] } {
  const na = ascendingMidis.length;
  const nd = descendingMidis.length;
  if (na === 0 && nd === 0) return { ascending: [], descending: [] };

  const rowsAsc = na === 0 ? 0 : Math.ceil(na / Math.max(1, maxPerRow));
  const rowsDesc = nd === 0 ? 0 : Math.ceil(nd / Math.max(1, maxPerRow));
  const rows = Math.max(rowsAsc, rowsDesc, 1);

  return {
    ascending: na === 0 ? [] : chunkMidisIntoBalancedRows(ascendingMidis, rows),
    descending:
      nd === 0 ? [] : chunkMidisIntoBalancedRows(descendingMidis, rows),
  };
}

export function staffRowWidthPx(noteCount: number): number {
  if (noteCount <= 0) return STAFF_CLEF_ZONE_PX + STAFF_RIGHT_MARGIN_PX;
  return (
    STAFF_CLEF_ZONE_PX +
    (noteCount - 1) * STAFF_NOTE_MIN_GAP_PX +
    STAFF_RIGHT_MARGIN_PX
  );
}
