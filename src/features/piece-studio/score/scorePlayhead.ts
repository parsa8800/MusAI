import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import {
  staffBandForNoteGroup,
  type StaffBand,
} from "@/features/piece-studio/score/staffBands";

/** Thin vertical bar — CSS also pins this so JS and paint stay aligned. */
export const SCORE_PLAYHEAD_WIDTH_PX = 3;
/** Rest / line-start sits just left of the first notehead. */
export const PLAYHEAD_LEAD_IN_PX = 48;
/** Keep travelling past the last note toward the end of the staff. */
export const PLAYHEAD_LEAD_OUT_PX = 36;

type PlayheadWaypoint = CursorPose & {
  /**
   * When true, x glides toward the next waypoint.
   * Attack waypoints travel across the staff and meet the next note on time.
   * A same-x waypoint (end of a held final note) keeps the bar still.
   */
  glideToNext?: boolean;
};

export type ScorePlayheadRect = {
  tSec: number;
  /** Left edge of the bar in wrap coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Note-centre x — the bar crosses the head at this x when the note sounds. */
  centerX: number;
};

/** Typical engraved five-line staff when DOM bands are missing. */
const FALLBACK_STAFF_HEIGHT_PX = 48;

function padStaffSpan(y: number, height: number): { y: number; height: number } {
  const pad = Math.max(5, Math.min(12, height * 0.22));
  return {
    y: Math.max(0, y - pad),
    height: Math.max(24, height + pad * 2),
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) * 0.5;
}

/**
 * Staff band for the playhead — always pick a band when any exist.
 * Ledger-line notes must not reject the staff (that made the bar chase pitch).
 */
function staffBandForPlayhead(
  pose: CursorPose,
  staffBands: readonly StaffBand[],
): StaffBand | null {
  if (staffBands.length === 0) return null;
  const poseMid = pose.y + pose.height * 0.5;

  const overlapping = staffBands.filter((band) => {
    const bottom = band.y + band.height;
    // Generous ledger room — high/low notes still belong to this staff.
    return poseMid >= band.y - band.height * 1.8 && poseMid <= bottom + band.height * 1.8;
  });
  const pool = overlapping.length > 0 ? overlapping : staffBands;

  let best = pool[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const band of pool) {
    const mid = band.y + band.height * 0.5;
    const dy = Math.abs(poseMid - mid);
    const overlapsX =
      pose.x >= band.x - 24 && pose.x <= band.x + band.width + 24;
    const score = dy + (overlapsX ? 0 : 120);
    if (score < bestScore) {
      bestScore = score;
      best = band;
    }
  }
  return best;
}

/**
 * Vertical span locked to the five-line staff — never follows notehead pitch.
 * Optional `systemNotes` stabilises the no-band fallback (median of the line).
 */
export function playheadStaffSpan(
  pose: CursorPose,
  staffBands: readonly StaffBand[] = [],
  systemNotes: readonly CursorPose[] = [],
): { y: number; height: number } {
  const band = staffBandForPlayhead(pose, staffBands);
  if (band) {
    return padStaffSpan(band.y, band.height);
  }

  // No engraved bands: pin to the median note of this system, fixed staff height.
  const notes = systemNotes.length > 0 ? systemNotes : [pose];
  const mids = notes.map((n) => n.y + n.height * 0.5);
  const mid = median(mids);
  return padStaffSpan(mid - FALLBACK_STAFF_HEIGHT_PX * 0.5, FALLBACK_STAFF_HEIGHT_PX);
}

function isSystemBreak(a: CursorPose, b: CursorPose): boolean {
  const dy = Math.abs(b.y + b.height * 0.5 - (a.y + a.height * 0.5));
  // Floor at a real staff height — notehead poses are ~10px and must not
  // turn ordinary pitch leaps into line wraps (that made the bar chase pitch).
  const staff = Math.max(a.height, b.height, 44);
  if (dy > staff * 1.6 + 28) return true;
  return b.x + 40 < a.x && dy > staff * 0.55;
}

function groupSystems(snaps: readonly CursorPose[]): CursorPose[][] {
  const groups: CursorPose[][] = [];
  for (const snap of snaps) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (prev && !isSystemBreak(prev, snap)) group.push(snap);
    else groups.push([snap]);
  }
  return groups;
}

function leadInX(first: CursorPose, band: StaffBand | null): number {
  // Prefer the engraved staff start (after margin) so t=0 sits at the
  // beginning of the line, not halfway to the first note.
  const staffLeft = band ? band.x + 10 : 0;
  const beforeNote = first.x - PLAYHEAD_LEAD_IN_PX;
  if (band && first.x - staffLeft > PLAYHEAD_LEAD_IN_PX * 1.5) {
    // Blend toward the clef/time area when there is room on the staff.
    const nearStart = staffLeft + Math.min(36, (first.x - staffLeft) * 0.22);
    return Math.max(staffLeft, Math.min(beforeNote, nearStart));
  }
  return Math.max(staffLeft, beforeNote);
}

function leadOutX(
  last: CursorPose,
  prev: CursorPose | undefined,
  band: StaffBand | null,
  travelSec: number,
): number {
  const staffRight = band ? band.x + band.width - 4 : last.x + 80;
  const speed =
    prev && last.tSec - prev.tSec > 1e-3
      ? Math.abs(last.x - prev.x) / (last.tSec - prev.tSec)
      : 80;
  const bySpeed = last.x + speed * Math.max(travelSec, 0.04);
  const minPast = last.x + Math.min(PLAYHEAD_LEAD_OUT_PX, 22);
  return Math.min(staffRight, Math.max(minPast, bySpeed));
}

function bandForNotes(
  notes: readonly CursorPose[],
  staffBands: readonly StaffBand[],
): StaffBand | null {
  const first = notes[0];
  const last = notes[notes.length - 1];
  if (!first || !last) return null;
  return staffBandForNoteGroup(
    staffBands,
    first.y + first.height * 0.5,
    Math.min(first.x, last.x),
    Math.max(first.x, last.x),
  );
}

function poseIndexAtOrBefore(points: readonly CursorPose[], tSec: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid]!.tSec <= tSec) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Waypoints for a left-to-right path. Between notes the bar glides and meets
 * each notehead as it sounds. On the last note of a line it keeps travelling
 * to the end of that staff for the note's length, then steps to the next line.
 * The step is instant so the bar never smears diagonally onto the next system.
 */
export function buildPlayheadWaypoints(
  snaps: readonly CursorPose[],
  staffBands: readonly StaffBand[] = [],
): PlayheadWaypoint[] {
  if (snaps.length === 0) return [];
  const groups = groupSystems(snaps);
  /** @type {PlayheadWaypoint[]} */
  const out: PlayheadWaypoint[] = [];

  for (let g = 0; g < groups.length; g += 1) {
    const notes = groups[g]!;
    const first = notes[0]!;
    const last = notes[notes.length - 1]!;
    const band = bandForNotes(notes, staffBands);
    const next = groups[g + 1]?.[0];
    const enterX = leadInX(first, band);

    if (g === 0 && first.tSec > 0.04) {
      // Musical silence before the first attack — approach from the clef.
      out.push({ ...first, tSec: 0, x: enterX, glideToNext: true });
    }

    for (let n = 0; n < notes.length; n += 1) {
      out.push({ ...notes[n]!, glideToNext: true });
    }

    const prev = notes.length > 1 ? notes[notes.length - 2] : undefined;
    const prevGap = prev ? last.tSec - prev.tSec : 0.6;
    const soundedUntil =
      last.endSec != null && last.endSec > last.tSec + 1e-3
        ? last.endSec
        : next
          ? next.tSec
          : last.tSec + Math.max(0.45, prevGap);
    // Leave this line when the last note has finished, not part-way through it.
    const tWrap = next ? Math.min(soundedUntil, next.tSec) : soundedUntil;
    const staffRight = band ? band.x + band.width - 6 : null;
    const exitX =
      staffRight != null
        ? Math.max(last.x + 8, staffRight)
        : leadOutX(last, prev, band, Math.max(0, tWrap - last.tSec));
    if (tWrap > last.tSec + 1e-3) {
      out.push({ ...last, tSec: tWrap, x: exitX, glideToNext: false });
    }
    if (next) {
      const nextBand = bandForNotes(groups[g + 1]!, staffBands);
      out.push({
        ...next,
        tSec: tWrap,
        x: leadInX(next, nextBand),
        glideToNext: true,
      });
    }
  }

  return out;
}

function interpolateWaypoints(
  points: readonly PlayheadWaypoint[],
  tSec: number,
): CursorPose | null {
  if (points.length === 0) return null;
  if (tSec <= points[0]!.tSec) {
    return { ...points[0]!, tSec: points[0]!.tSec };
  }
  const last = points[points.length - 1]!;
  if (tSec >= last.tSec) return { ...last, tSec: last.tSec };

  const i = poseIndexAtOrBefore(points, tSec);
  const a = points[i]!;
  const b = points[i + 1];
  if (!b) return { ...a, tSec };

  // Instant wrap (end of line → start of next): already on the new line.
  if (b.tSec - a.tSec <= 1e-6) {
    return tSec < b.tSec ? { ...a, tSec } : { ...b, tSec };
  }

  const span = b.tSec - a.tSec;
  if (!a.glideToNext) {
    return { ...a, tSec };
  }
  const u = (tSec - a.tSec) / span;
  const aw = a.width;
  const bw = b.width;
  return {
    tSec,
    x: a.x + (b.x - a.x) * u,
    y: a.y,
    height: a.height,
    width: aw != null && bw != null ? aw + (bw - aw) * u : (aw ?? bw),
  };
}

export function playheadRectFromPose(
  pose: CursorPose,
  staffBands: readonly StaffBand[] = [],
  systemNotes: readonly CursorPose[] = [],
): ScorePlayheadRect {
  const span = playheadStaffSpan(pose, staffBands, systemNotes);
  const width = SCORE_PLAYHEAD_WIDTH_PX;
  return {
    tSec: pose.tSec,
    centerX: pose.x,
    x: pose.x - width * 0.5,
    y: span.y,
    width,
    height: span.height,
  };
}

const EMPTY_STAFF_BANDS: readonly StaffBand[] = [];

let waypointCache: {
  snaps: readonly CursorPose[];
  staffBands: readonly StaffBand[];
  points: CursorPose[];
} | null = null;

function waypointsFor(
  snaps: readonly CursorPose[],
  staffBands: readonly StaffBand[],
): PlayheadWaypoint[] {
  if (
    waypointCache &&
    waypointCache.snaps === snaps &&
    waypointCache.staffBands === staffBands
  ) {
    return waypointCache.points as PlayheadWaypoint[];
  }
  const points = buildPlayheadWaypoints(snaps, staffBands);
  waypointCache = { snaps, staffBands, points };
  return points;
}

/**
 * Live playhead: sits on the sounding note and meets the next notehead
 * when it speaks. Vertical position stays locked to the staff.
 */
export function interpolatePlayhead(
  snaps: readonly CursorPose[],
  tSec: number,
  staffBands: readonly StaffBand[] = EMPTY_STAFF_BANDS,
): ScorePlayheadRect | null {
  const pose = interpolateWaypoints(waypointsFor(snaps, staffBands), tSec);
  if (!pose) return null;
  const systemNotes = systemNotesForPose(snaps, pose);
  return playheadRectFromPose(pose, staffBands, systemNotes);
}

/** Notes on the same engraved system as `pose` (for stable no-band fallback). */
function systemNotesForPose(
  snaps: readonly CursorPose[],
  pose: CursorPose,
): CursorPose[] {
  if (snaps.length === 0) return [];
  const groups = groupSystems(snaps);
  let best: CursorPose[] = groups[0] ?? [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const group of groups) {
    const first = group[0];
    if (!first) continue;
    const mid =
      group.reduce((sum, n) => sum + n.y + n.height * 0.5, 0) / group.length;
    const poseMid = pose.y + pose.height * 0.5;
    const dy = Math.abs(poseMid - mid);
    const x0 = Math.min(...group.map((n) => n.x));
    const x1 = Math.max(...group.map((n) => n.x));
    const inX = pose.x >= x0 - 40 && pose.x <= x1 + 80;
    const score = dy + (inX ? 0 : 200);
    if (score < bestScore) {
      bestScore = score;
      best = group;
    }
  }
  return best;
}

export function applyPlayheadElement(
  el: HTMLElement,
  pose: ScorePlayheadRect | null,
): void {
  if (!pose) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  el.style.width = `${pose.width}px`;
  el.style.height = `${pose.height}px`;
  el.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0)`;
}

/**
 * Keep the active system in view. Always jump immediately — a smooth
 * scroll leaves the bar off-screen while the audio has already moved on.
 */
export function followPlayheadInScrollParent(
  wrap: HTMLElement,
  pose: ScorePlayheadRect,
  lastScrollY: { current: number | null },
): void {
  const viewTop = wrap.scrollTop + wrap.clientHeight * 0.14;
  const viewBottom = wrap.scrollTop + wrap.clientHeight * 0.82;
  const cursorMid = pose.y + pose.height / 2;
  if (cursorMid >= viewTop && cursorMid <= viewBottom) {
    lastScrollY.current = pose.y;
    return;
  }
  if (
    lastScrollY.current != null &&
    Math.abs(lastScrollY.current - pose.y) < 6
  ) {
    return;
  }
  const top = Math.max(0, pose.y - wrap.clientHeight * 0.3);
  lastScrollY.current = pose.y;
  if (typeof wrap.scrollTo === "function") {
    wrap.scrollTo({ top, behavior: "auto" });
  } else {
    wrap.scrollTop = top;
  }
}
