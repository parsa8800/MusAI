/**
 * Keep the first engraved system of an OSMD SVG so a library card shows
 * the written opening, not a hand-drawn stand-in.
 *
 * Every card uses the same staff-space window, so a short tune and a wide
 * system render at the same note size. A crowded opening keeps only the
 * first noteheads, so a packed bar does not fill the card.
 */
type StaffLine = { x0: number; x1: number; y: number };

const SPACES_ABOVE = 4.6;
const SPACES_BELOW = 3.4;
const SPACES_WIDE = 30;
/** Heads in the wide window before the opening is treated as crowded. */
const CROWDED_HEADS = 18;
/** How many heads a crowded opening keeps. */
const OPENING_HEADS = 8;
/** How far a glyph may sit and still count as part of this opening. */
const GATE_ABOVE = 12;
const GATE_BELOW = 7;

/** Tempo, dynamics, and other worded directions are text on top of the notes. */
export function stripLibrarySnippetWords(svg: SVGSVGElement): void {
  for (const el of [...svg.querySelectorAll("text")]) {
    el.remove();
  }
}

export function cropSvgToFirstSystem(svg: SVGSVGElement): boolean {
  const lines = staffLines(svg);
  const staves = fiveLineStaves(lines);
  if (staves.length === 0) return false;

  const first = staves[0]!;
  const spacing = first.spacing;
  const band = lines.filter(
    (line) => line.y >= first.top - 0.5 && line.y <= first.bottom + 0.5,
  );
  const x0 = Math.min(...band.map((line) => line.x0)) - spacing * 0.45;
  const y0 = first.top - spacing * SPACES_ABOVE;
  const wide = spacing * SPACES_WIDE;
  const width = openingWidth(noteHeads(svg, first), x0, spacing, wide);
  const height = spacing * (4 + SPACES_ABOVE + SPACES_BELOW);
  const crowded = width < wide - spacing * 0.5;
  const frame = expandFrameToWholeNotes(svg, {
    x: x0,
    y: y0,
    width,
    height,
    gateLeft: x0 - spacing * 1.5,
    gateTop: first.top - spacing * GATE_ABOVE,
    gateRight: x0 + width,
    gateBottom: first.bottom + spacing * GATE_BELOW,
    pad: spacing * 0.45,
    keepSpans: !crowded,
  });

  svg.setAttribute(
    "viewBox",
    `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
  );
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return true;
}

type NoteHead = { x: number };

/**
 * A crowded first line (many heads in the wide window) keeps only the
 * opening. A sparse line keeps the full window, so note size stays put.
 */
function openingWidth(
  heads: NoteHead[],
  x0: number,
  spacing: number,
  wide: number,
): number {
  const inWindow = heads
    .filter((head) => head.x >= x0 - spacing && head.x <= x0 + wide)
    .sort((a, b) => a.x - b.x);
  if (inWindow.length < CROWDED_HEADS) return wide;

  const kept = inWindow.slice(0, OPENING_HEADS);
  const last = kept[kept.length - 1];
  const right = last ? last.x + spacing * 1.6 : x0 + spacing * 12;
  return Math.min(wide, Math.max(spacing * 12, right - x0));
}

function noteHeads(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
): NoteHead[] {
  const heads: NoteHead[] = [];
  const above = staff.top - staff.spacing * 6;
  const below = staff.bottom + staff.spacing * 6;
  for (const el of svg.querySelectorAll("g")) {
    const cls = el.getAttribute("class") ?? "";
    if (!/(?:^|\s)vf-stavenote(?:\s|$)/.test(cls)) continue;
    const box = userBox(svg, el);
    if (!box) continue;
    const x = (box.x + box.x1) / 2;
    const y = (box.y + box.y1) / 2;
    if (y < above || y > below) continue;
    heads.push({ x });
  }
  return heads;
}

type Frame = { x: number; y: number; width: number; height: number };

/**
 * A note, beam, or clef whose center sits in the opening is kept whole.
 * Glyphs past that line are left out, so the card never slices a notehead.
 */
function expandFrameToWholeNotes(
  svg: SVGSVGElement,
  frame: Frame & {
    gateLeft: number;
    gateTop: number;
    gateRight: number;
    gateBottom: number;
    pad: number;
    /** Packed openings must not grow to fit a beam or slur across the pile. */
    keepSpans: boolean;
  },
): Frame {
  let x = frame.x;
  let y = frame.y;
  let right = frame.x + frame.width;
  let bottom = frame.y + frame.height;
  const glyphs = svg.querySelectorAll("g");
  for (const el of glyphs) {
    if (!isSnippetGlyph(el)) continue;
    const cls = el.getAttribute("class") ?? "";
    const spans = /vf-(?:beam|curve|tie|tuplet)(?:\s|$)/.test(cls);
    if (spans && !frame.keepSpans) continue;
    const box = userBox(svg, el);
    if (!box) continue;
    const cx = (box.x + box.x1) / 2;
    const cy = (box.y + box.y1) / 2;
    if (
      cx < frame.gateLeft ||
      cx > frame.gateRight ||
      cy < frame.gateTop ||
      cy > frame.gateBottom
    ) {
      continue;
    }
    const boxLeft = spans ? Math.max(box.x, frame.gateLeft) : box.x;
    const boxRight = spans ? Math.min(box.x1, frame.gateRight) : box.x1;
    x = Math.min(x, boxLeft - frame.pad);
    y = Math.min(y, box.y - frame.pad);
    right = Math.max(right, boxRight + frame.pad);
    bottom = Math.max(bottom, box.y1 + frame.pad);
  }
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function isSnippetGlyph(el: Element): boolean {
  const cls = el.getAttribute("class") ?? "";
  return /(?:^|\s)vf-(?:stavenote|beam|clef|keysignature|timesignature|stavebarline|tuplet|curve|tie|articulation|ornament|annotation)(?:\s|$)/.test(
    cls,
  );
}

function userBox(
  svg: SVGSVGElement,
  el: Element,
): { x: number; y: number; x1: number; y1: number } | null {
  const svgRect = svg.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  if (svgRect.width < 2 || svgRect.height < 2) return null;
  if (rect.width < 0.4 && rect.height < 0.4) return null;
  const vb = svg.viewBox?.baseVal;
  const hasView = Boolean(vb && vb.width > 0 && vb.height > 0);
  const vx = hasView ? vb.x : 0;
  const vy = hasView ? vb.y : 0;
  const vw = hasView ? vb.width : svgRect.width;
  const vh = hasView ? vb.height : svgRect.height;
  const x = vx + ((rect.left - svgRect.left) * vw) / svgRect.width;
  const y = vy + ((rect.top - svgRect.top) * vh) / svgRect.height;
  const x1 = x + (rect.width * vw) / svgRect.width;
  const y1 = y + (rect.height * vh) / svgRect.height;
  if (![x, y, x1, y1].every(Number.isFinite)) return null;
  return { x, y, x1, y1 };
}

function fiveLineStaves(lines: StaffLine[]): {
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  spacing: number;
}[] {
  if (lines.length < 5) return [];
  const longest = Math.max(...lines.map((line) => line.x1 - line.x0));
  const staffish = lines
    .filter((line) => line.x1 - line.x0 >= longest * 0.72)
    .sort((a, b) => a.y - b.y);
  const spacing = medianSpacing(staffish.map((line) => line.y));
  if (spacing < 2) return [];

  const staves: {
    top: number;
    bottom: number;
    x0: number;
    x1: number;
    spacing: number;
  }[] = [];
  let cursor = 0;
  while (cursor < staffish.length) {
    const run: StaffLine[] = [staffish[cursor]!];
    for (let step = 1; step < 5; step += 1) {
      const target = run[0]!.y + spacing * step;
      const next = staffish.find(
        (line) =>
          line.y > run[run.length - 1]!.y + spacing * 0.45 &&
          Math.abs(line.y - target) <= spacing * 0.35,
      );
      if (!next) break;
      run.push(next);
    }
    if (run.length === 5) {
      staves.push({
        top: run[0]!.y,
        bottom: run[4]!.y,
        x0: Math.min(...run.map((line) => line.x0)),
        x1: Math.max(...run.map((line) => line.x1)),
        spacing,
      });
      const lastY = run[4]!.y;
      cursor = staffish.findIndex((line) => line.y > lastY + spacing * 0.45);
      if (cursor < 0) break;
      continue;
    }
    cursor += 1;
  }
  return staves;
}

function staffLines(svg: SVGSVGElement): StaffLine[] {
  const lines: StaffLine[] = [];
  for (const el of svg.querySelectorAll("path, line")) {
    const shift = translationOf(el, svg);
    if (el.tagName.toLowerCase() === "line") {
      const y1 = Number(el.getAttribute("y1"));
      const y2 = Number(el.getAttribute("y2"));
      const x1 = Number(el.getAttribute("x1"));
      const x2 = Number(el.getAttribute("x2"));
      if (![x1, x2, y1, y2].every(Number.isFinite)) continue;
      if (Math.abs(y2 - y1) > 1.25 || Math.abs(x2 - x1) < 40) continue;
      lines.push({
        x0: Math.min(x1, x2) + shift.x,
        x1: Math.max(x1, x2) + shift.x,
        y: (y1 + y2) / 2 + shift.y,
      });
      continue;
    }
    const d = el.getAttribute("d") ?? "";
    const match = d
      .trim()
      .match(
        /^M\s*([-\d.]+)[,\s]+([-\d.]+)\s*[LH]\s*([-\d.]+)[,\s]+([-\d.]+)\s*$/i,
      );
    if (!match) continue;
    const x0 = Number(match[1]);
    const y0 = Number(match[2]);
    const x1 = Number(match[3]);
    const y1 = Number(match[4]);
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    if (Math.abs(y1 - y0) > 1.25 || Math.abs(x1 - x0) < 40) continue;
    lines.push({
      x0: Math.min(x0, x1) + shift.x,
      x1: Math.max(x0, x1) + shift.x,
      y: (y0 + y1) / 2 + shift.y,
    });
  }
  return lines;
}

/** VexFlow parks each staff in a translated group; path coords are local. */
function translationOf(el: Element, svg: SVGSVGElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: Element | null = el;
  while (node && node !== svg) {
    const t = node.getAttribute("transform") ?? "";
    const translate = t.match(
      /translate\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)/i,
    );
    if (translate) {
      x += Number(translate[1]) || 0;
      y += Number(translate[2]) || 0;
    }
    const matrix = t.match(
      /matrix\(\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*\)/i,
    );
    if (matrix) {
      x += Number(matrix[5]) || 0;
      y += Number(matrix[6]) || 0;
    }
    node = node.parentElement;
  }
  return { x, y };
}

function medianSpacing(ys: number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < ys.length; i += 1) {
    const gap = ys[i]! - ys[i - 1]!;
    if (gap > 1.5 && gap < 40) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 0;
}
