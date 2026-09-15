/**
 * Read engraved notehead centres from the OSMD/VexFlow SVG.
 * Used for Listen playhead when the OSMD cursor walk is incomplete.
 */

export type DomNotePose = {
  x: number;
  y: number;
  height: number;
};

const NOTEHEAD_SELECTORS = [
  "g.vf-notehead",
  "path.vf-notehead",
  "ellipse.vf-notehead",
  ".vf-notehead",
  '[class*="vf-notehead"]',
].join(", ");

const STAVENOTE_FALLBACK = "g.vf-stavenote, g.vf-note";

/**
 * Collect left-to-right (then system-top-to-bottom) notehead centres in wrap space.
 * Chord noteheads at the same attack are deduped to one pose.
 */
export function collectNoteheadPosesFromDom(wrap: HTMLElement): DomNotePose[] {
  const host =
    wrap.querySelector<HTMLElement>(".musai-piece-osmd") ?? wrap;
  const svg = host.querySelector("svg");
  if (!svg) return [];

  const wrapRect = wrap.getBoundingClientRect();
  let nodes = [...svg.querySelectorAll(NOTEHEAD_SELECTORS)];
  if (nodes.length < 2) {
    nodes = [...svg.querySelectorAll(STAVENOTE_FALLBACK)];
  }
  if (nodes.length === 0) return [];

  const raw: Array<DomNotePose & { sortY: number; sortX: number }> = [];
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    const x =
      r.left - wrapRect.left + wrap.scrollLeft + Math.max(r.width, 1) * 0.5;
    const y = r.top - wrapRect.top + wrap.scrollTop;
    const height = Math.max(r.height, 20);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    raw.push({ x, y, height, sortY: y, sortX: x });
  }

  raw.sort((a, b) => {
    const dy = a.sortY - b.sortY;
    // New system when y jumps by more than a staff.
    if (Math.abs(dy) > 28) return dy;
    return a.sortX - b.sortX;
  });

  const out: DomNotePose[] = [];
  for (const p of raw) {
    const prev = out[out.length - 1];
    // Same attack / chord: keep the first (usually upper) head.
    if (
      prev &&
      Math.abs(prev.x - p.x) < 8 &&
      Math.abs(prev.y - p.y) < 36
    ) {
      continue;
    }
    out.push({ x: p.x, y: p.y, height: p.height });
  }
  return out;
}
