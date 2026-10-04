/**
 * Read engraved notehead centres from the OSMD/VexFlow SVG.
 * Used for Listen playhead when the OSMD cursor walk is incomplete.
 */

import {
  collectStaffBandsFromDom,
  engravedScoreSvgs,
  type StaffBand,
} from "@/features/piece-studio/score/staffBands";

export type DomNotePose = {
  /** Centre x in wrap coordinates. */
  x: number;
  y: number;
  height: number;
  /** Engraved oval width — keeps Practise washes flush to the heads. */
  width: number;
};

const NOTEHEAD_SELECTORS = [
  "g.vf-notehead",
  "path.vf-notehead",
  "ellipse.vf-notehead",
  ".vf-notehead",
  '[class*="vf-notehead"]',
].join(", ");

const STAVENOTE_FALLBACK = "g.vf-stavenote, g.vf-note";

/** Rests share the notehead class. Notehead ovals are neither tall nor flat bars. */
function isRestShapedGlyph(width: number, height: number): boolean {
  if (width < 1 || height < 1) return false;
  if (height > width * 1.6) return true;
  return width > height * 2.2;
}

function isGraceOrCueHead(node: Element): boolean {
  let el: Element | null = node;
  for (let i = 0; i < 8 && el; i += 1) {
    const cls = el.getAttribute("class") ?? "";
    if (/(^|\s)vf-grace|gracenote|cuehead|cue-note/i.test(cls)) return true;
    el = el.parentElement;
  }
  return false;
}

function staffIndexForHead(
  pose: { x: number; y: number; height: number },
  bands: readonly StaffBand[],
): number {
  if (bands.length === 0) return 0;
  const mid = pose.y + pose.height * 0.5;
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i]!;
    const bandMid = band.y + band.height * 0.5;
    const dy = Math.abs(mid - bandMid);
    const overlapsX =
      pose.x >= band.x - 32 && pose.x <= band.x + band.width + 32;
    const score = dy + (overlapsX ? 0 : 160);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Group notes onto staves when engraved staff lines were not found. */
function clusterSystemIds(poses: readonly DomNotePose[]): number[] {
  if (poses.length === 0) return [];
  const mids = poses.map((p) => p.y + p.height * 0.5);
  const cores: number[] = [];
  for (let i = 0; i < poses.length; i += 1) {
    let neighbors = 0;
    for (let j = 0; j < poses.length; j += 1) {
      if (Math.abs(mids[i]! - mids[j]!) < 22) neighbors += 1;
    }
    if (neighbors < 2) continue;
    if (!cores.some((c) => Math.abs(c - mids[i]!) < 28)) {
      cores.push(mids[i]!);
    }
  }
  if (cores.length === 0) return poses.map(() => 0);
  cores.sort((a, b) => a - b);
  return mids.map((m) => {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < cores.length; i += 1) {
      const d = Math.abs(m - cores[i]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  });
}

/**
 * Reading order: staff top-to-bottom, then left-to-right.
 * Ledger-line notes join the nearest staff so a high E is not sorted as
 * a previous system.
 */
export function sortNoteheadsInReadingOrder<T extends DomNotePose>(
  poses: readonly T[],
  staffBands: readonly StaffBand[] = [],
): T[] {
  if (poses.length < 2) return [...poses];
  const systems =
    staffBands.length > 0
      ? poses.map((p) => staffIndexForHead(p, staffBands))
      : clusterSystemIds(poses);
  const keyed = poses.map((p, i) => ({ p, i, sys: systems[i] ?? 0 }));
  keyed.sort((a, b) => a.sys - b.sys || a.p.x - b.p.x || a.p.y - b.p.y || a.i - b.i);
  return keyed.map((k) => k.p);
}

function collapseChordHeads<T extends DomNotePose>(sorted: readonly T[]): T[] {
  const out: T[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    // Same attack: stacked chord tones or a duplicate head at this x.
    const chordDx = Math.max(7, Math.min(p.width, prev?.width ?? p.width) * 0.7);
    if (prev && Math.abs(prev.x - p.x) < chordDx) {
      continue;
    }
    out.push(p);
  }
  return out;
}

export type DomNoteTarget = DomNotePose & { el: Element };

/** Engraved heads in score order, with the SVG node to recolour. */
export function collectNoteheadTargets(wrap: HTMLElement): DomNoteTarget[] {
  const host =
    wrap.querySelector<HTMLElement>(".musai-piece-osmd") ?? wrap;
  const svgs = engravedScoreSvgs(host);
  if (svgs.length === 0) return [];

  const wrapRect = wrap.getBoundingClientRect();
  const raw: DomNoteTarget[] = [];
  for (const svg of svgs) {
    let nodes = [...svg.querySelectorAll(NOTEHEAD_SELECTORS)];
    if (nodes.length < 2) {
      nodes = [...svg.querySelectorAll(STAVENOTE_FALLBACK)];
    }
    for (const node of nodes) {
      if (isGraceOrCueHead(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      // OSMD paints rests with the notehead class. A quarter rest is tall
      // and narrow; a half or whole rest is a flat bar. Counting either as
      // a note shifts every later colour onto the wrong head.
      if (isRestShapedGlyph(r.width, r.height)) continue;
      const width = Math.max(r.width, 1);
      const height = Math.max(r.height, 1);
      const x = r.left - wrapRect.left + wrap.scrollLeft + width * 0.5;
      const y = r.top - wrapRect.top + wrap.scrollTop;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      raw.push({ el: node, x, y, height, width });
    }
  }
  if (raw.length === 0) return [];
  const bands = collectStaffBandsFromDom(wrap);
  return collapseChordHeads(sortNoteheadsInReadingOrder(raw, bands));
}

/**
 * Collect left-to-right (then system-top-to-bottom) notehead centres in wrap space.
 * Chord noteheads at the same attack are deduped to one pose. Grace / cue heads
 * are skipped so the playhead zips 1:1 with sounding attacks.
 */
export function collectNoteheadPosesFromDom(wrap: HTMLElement): DomNotePose[] {
  return collectNoteheadTargets(wrap).map(({ x, y, height, width }) => ({
    x,
    y,
    height,
    width,
  }));
}
