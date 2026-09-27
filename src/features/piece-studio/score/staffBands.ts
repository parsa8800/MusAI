/**
 * Engraved staff bands from the OSMD/VexFlow SVG — Practise washes snap to
 * these so pitch leaps never stretch the highlight past the five staff lines.
 *
 * VexFlow draws staff lines as stroked <path> elements (`M x y L x2 y`), not
 * SVG <line>. getBoundingClientRect height is often 0 for those strokes.
 * Never match `vf-stavenote` when looking for stave groups.
 */

export type StaffBand = {
  /** Top of the highest staff line (wrap coordinates). */
  y: number;
  /** Distance from highest to lowest staff line. */
  height: number;
  x: number;
  width: number;
};

type HorizLine = { y: number; x0: number; x1: number };

function nearlyEqual(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

/** VexFlow staff stroke: `M10 40L400 40` (optional commas / decimals). */
export function horizontalPathSpan(
  d: string,
): { x0: number; x1: number; y: number } | null {
  const m = d
    .trim()
    .match(
      /^M\s*([-\d.]+)[,\s]+([-\d.]+)\s*L\s*([-\d.]+)[,\s]+([-\d.]+)\s*$/i,
    );
  if (!m) return null;
  const x0 = Number(m[1]);
  const y0 = Number(m[2]);
  const x1 = Number(m[3]);
  const y1 = Number(m[4]);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  if (Math.abs(y1 - y0) > 1.25) return null;
  if (Math.abs(x1 - x0) < 40) return null;
  return {
    x0: Math.min(x0, x1),
    x1: Math.max(x0, x1),
    y: (y0 + y1) * 0.5,
  };
}

function toWrapLine(
  wrap: HTMLElement,
  wrapRect: DOMRect,
  box: DOMRect,
): HorizLine | null {
  // Stroked staff paths often report height 0 — still valid.
  if (box.width < 48 || box.height > 6) return null;
  return {
    y: box.top - wrapRect.top + wrap.scrollTop + box.height * 0.5,
    x0: box.left - wrapRect.left + wrap.scrollLeft,
    x1: box.left - wrapRect.left + wrap.scrollLeft + box.width,
  };
}

function isStaveGroup(el: Element): boolean {
  const cls = el.getAttribute("class") ?? "";
  // Exact token `vf-stave` — not `vf-stavenote` / `vf-stavebarline`.
  return /(^|\s)vf-stave(\s|$)/.test(cls);
}

/** Visible engraved SVGs — skip display:none page sheets. */
export function engravedScoreSvgs(host: HTMLElement): SVGElement[] {
  const all = [...host.querySelectorAll("svg")];
  const visible = all.filter((svg) => {
    const box = svg.getBoundingClientRect();
    return box.width >= 8 && box.height >= 8;
  });
  return visible.length > 0 ? visible : all;
}

/**
 * Collect five-line staff rectangles from engraved horizontal strokes
 * (paths + lines), falling back to VexFlow stave groups (not note groups).
 */
export function collectStaffBandsFromDom(wrap: HTMLElement): StaffBand[] {
  const host =
    wrap.querySelector<HTMLElement>(".musai-piece-osmd") ?? wrap;
  const svgs = engravedScoreSvgs(host);
  if (svgs.length === 0) return [];

  const wrapRect = wrap.getBoundingClientRect();
  const lines: HorizLine[] = [];
  const staveBands: StaffBand[] = [];

  for (const svg of svgs) {
    for (const el of svg.querySelectorAll("line")) {
      const line = toWrapLine(wrap, wrapRect, el.getBoundingClientRect());
      if (line) lines.push(line);
    }

    for (const el of svg.querySelectorAll("path")) {
      const d = el.getAttribute("d") ?? "";
      if (d.length === 0 || d.length > 160) continue;
      if (!horizontalPathSpan(d)) continue;
      const line = toWrapLine(wrap, wrapRect, el.getBoundingClientRect());
      if (line) lines.push(line);
    }

    for (const stave of svg.querySelectorAll("g")) {
      if (!isStaveGroup(stave)) continue;
      const childLines: HorizLine[] = [];
      for (const child of stave.querySelectorAll("path, line")) {
        const d = child.getAttribute("d");
        if (d && !horizontalPathSpan(d) && child.tagName.toLowerCase() === "path") {
          continue;
        }
        const line = toWrapLine(wrap, wrapRect, child.getBoundingClientRect());
        if (line) childLines.push(line);
      }
      if (childLines.length >= 4) {
        staveBands.push(...clusterStaffLines(childLines));
        continue;
      }
      const box = stave.getBoundingClientRect();
      if (box.width < 48 || box.height < 16 || box.height > 220) continue;
      staveBands.push({
        y: box.top - wrapRect.top + wrap.scrollTop,
        height: box.height,
        x: box.left - wrapRect.left + wrap.scrollLeft,
        width: box.width,
      });
    }
  }

  const fromStrokes = clusterStaffLines(lines);
  if (fromStrokes.length > 0) return mergeNearbyBands(fromStrokes);
  return mergeNearbyBands(staveBands);
}

function clusterStaffLines(lines: HorizLine[]): StaffBand[] {
  if (lines.length < 4) return [];
  // Merge identical y-levels first so multi-measure strokes share one row.
  const byY: HorizLine[] = [];
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  for (const line of sorted) {
    const prev = byY[byY.length - 1];
    if (prev && nearlyEqual(prev.y, line.y, 0.75)) {
      prev.x0 = Math.min(prev.x0, line.x0);
      prev.x1 = Math.max(prev.x1, line.x1);
      prev.y = (prev.y + line.y) * 0.5;
      continue;
    }
    byY.push({ ...line });
  }

  const bands: StaffBand[] = [];
  let i = 0;
  while (i < byY.length) {
    const cluster: HorizLine[] = [byY[i]!];
    let j = i + 1;
    while (j < byY.length && cluster.length < 5) {
      const prev = cluster[cluster.length - 1]!;
      const gap = byY[j]!.y - prev.y;
      if (gap > 28) break;
      if (cluster.length >= 2 && gap > clusterSpacing(cluster) * 1.9) break;
      cluster.push(byY[j]!);
      j += 1;
    }

    if (cluster.length >= 4) {
      const y = cluster[0]!.y;
      const bottom = cluster[cluster.length - 1]!.y;
      const x0 = Math.min(...cluster.map((l) => l.x0));
      const x1 = Math.max(...cluster.map((l) => l.x1));
      bands.push({
        y,
        height: Math.max(18, bottom - y),
        x: x0,
        width: Math.max(40, x1 - x0),
      });
      i = j;
      continue;
    }
    i += 1;
  }
  return bands;
}

function clusterSpacing(cluster: readonly HorizLine[]): number {
  if (cluster.length < 2) return 10;
  let sum = 0;
  for (let k = 1; k < cluster.length; k += 1) {
    sum += cluster[k]!.y - cluster[k - 1]!.y;
  }
  return sum / (cluster.length - 1);
}

function mergeNearbyBands(bands: StaffBand[]): StaffBand[] {
  if (bands.length === 0) return [];
  const sorted = [...bands].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: StaffBand[] = [];
  for (const band of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      nearlyEqual(prev.y, band.y, 6) &&
      nearlyEqual(prev.height, band.height, 8)
    ) {
      const x0 = Math.min(prev.x, band.x);
      const x1 = Math.max(prev.x + prev.width, band.x + band.width);
      prev.x = x0;
      prev.width = x1 - x0;
      continue;
    }
    out.push({ ...band });
  }
  return out;
}

/** Pick the staff band that best matches a note group’s span. */
export function staffBandForNoteGroup(
  bands: readonly StaffBand[],
  noteY: number,
  noteX0: number,
  noteX1: number,
): StaffBand | null {
  if (bands.length === 0) return null;
  let best: StaffBand | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const band of bands) {
    const mid = band.y + band.height * 0.5;
    const dy = Math.abs(noteY - mid);
    const overlapsX =
      noteX1 >= band.x - 8 && noteX0 <= band.x + band.width + 8;
    const insideY =
      noteY >= band.y - band.height * 0.35 &&
      noteY <= band.y + band.height * 1.35;
    const score = dy + (overlapsX ? 0 : 80) + (insideY ? 0 : 40);
    if (score < bestScore) {
      bestScore = score;
      best = band;
    }
  }
  if (best && bestScore > Math.max(best.height * 2.5, 64)) return null;
  return best;
}
