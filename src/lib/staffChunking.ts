/**
 * Staff systems for scale notation.
 *
 * Prefer one ascending system and one descending system. When width is tight,
 * break only at octave boundaries (never mid-run “sheet music” shards).
 */

/** Slightly roomier than a raw 30px heuristic so noteheads can breathe. */
export const STAFF_NOTE_MIN_GAP_PX = 34;
export const STAFF_CLEF_ZONE_PX = 54;
export const STAFF_RIGHT_MARGIN_PX = 28;

/**
 * Two-octave ascending scales are 15 notes (tonic → upper tonic).
 * Cap must allow a full ascending (or descending) run on one system when width permits.
 */
export const MAX_NOTES_PER_STAFF_ROW_CAP = 16;

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

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/**
 * Split a scale run into octave-sized segments (tonic → next tonic).
 * Direction is inferred from first/last pitch.
 */
export function chunkMidisAtOctaves(midis: number[]): number[][] {
  if (midis.length === 0) return [];
  if (midis.length === 1) return [midis];

  const first = midis[0]!;
  const last = midis[midis.length - 1]!;
  const ascending = last >= first;
  const tonicPc = pitchClass(ascending ? first : last);

  const exclusiveEnds: number[] = [];
  for (let i = 1; i < midis.length; i++) {
    if (pitchClass(midis[i]!) !== tonicPc) continue;
    exclusiveEnds.push(i + 1);
  }

  if (exclusiveEnds.length === 0) {
    return [midis];
  }

  if (exclusiveEnds[exclusiveEnds.length - 1]! !== midis.length) {
    exclusiveEnds.push(midis.length);
  }

  const chunks: number[][] = [];
  let start = 0;
  for (const end of exclusiveEnds) {
    if (end <= start) continue;
    chunks.push(midis.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [midis];
}

/** Pack consecutive octave segments onto one staff while they fit `maxPerRow`. */
export function packOctaveChunks(
  octaves: number[][],
  maxPerRow: number,
): number[][] {
  if (octaves.length === 0) return [];
  const cap = Math.max(1, maxPerRow);
  const rows: number[][] = [];
  let current: number[] = [];

  for (const oct of octaves) {
    if (oct.length === 0) continue;
    if (current.length === 0) {
      current = [...oct];
      continue;
    }
    // Never split an octave segment — if it alone exceeds cap, it still gets its own row.
    if (current.length + oct.length <= cap) {
      current.push(...oct);
    } else {
      rows.push(current);
      current = [...oct];
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/** @deprecated Prefer octave packing; kept for callers that still pass a row count. */
export function chunkMidisIntoBalancedRows(
  midis: number[],
  rowCount: number,
): number[][] {
  if (midis.length === 0 || rowCount <= 0) return [];
  const n = midis.length;
  const rows = Math.min(rowCount, n);
  if (rows === 1) return [midis];

  // Prefer octave boundaries over equal-length shards.
  const packed = packOctaveChunks(chunkMidisAtOctaves(midis), Math.ceil(n / rows));
  if (packed.length === rows) return packed;
  if (packed.length < rows) return packed;

  // Too many octave rows for the requested count — merge from the start.
  while (packed.length > rows) {
    const a = packed.shift()!;
    packed[0] = [...a, ...packed[0]!];
  }
  return packed;
}

/**
 * Chunk a single direction (asc or desc): whole run if it fits, else octave rows only.
 */
export function chunkMidisForStaff(
  midis: number[],
  maxPerRow: number,
): number[][] {
  if (midis.length === 0) return [];
  const cap = Math.max(1, maxPerRow);
  if (midis.length <= cap) return [midis];
  return packOctaveChunks(chunkMidisAtOctaves(midis), cap);
}

/**
 * Ascending and descending chunked independently with the same octave rules.
 * Each direction stays musically intact (full run, or whole-octave systems).
 */
export function chunkMidisForStaffPaired(
  ascendingMidis: number[],
  descendingMidis: number[],
  maxPerRow: number,
): { ascending: number[][]; descending: number[][] } {
  return {
    ascending: chunkMidisForStaff(ascendingMidis, maxPerRow),
    descending: chunkMidisForStaff(descendingMidis, maxPerRow),
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
