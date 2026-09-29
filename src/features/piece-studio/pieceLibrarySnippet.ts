/**
 * Keep the first engraved system of an OSMD SVG so a library card shows
 * the written opening, not a hand-drawn stand-in.
 *
 * Every card uses the same staff-space window, so a short tune and a wide
 * system render at the same note size.
 */
type StaffLine = { x0: number; x1: number; y: number };

const SPACES_ABOVE = 4.5;
const SPACES_BELOW = 2.35;
const SPACES_WIDE = 26;
/** Opening shown on a card: up to the first two complete bars. */
const OPENING_BARS = 2;
/** Two bars wider than this shrink the staff, so the card keeps one whole bar. */
const TWO_BAR_MAX_SPACES = 38;
/** More heads than this in the opening reads as a clump, so only the start is kept. */
const CROWDED_HEADS = 9;
/** Heads a crowded opening keeps, so each note stays readable. */
const OPENING_HEADS = 4;
/** How far a glyph may sit and still count as part of this opening. */
const GATE_ABOVE = 7;
const GATE_BELOW = 2.6;

/** Tempo, dynamics, and other worded directions are text on top of the notes. */
export function stripLibrarySnippetWords(svg: SVGSVGElement): void {
  for (const el of [...svg.querySelectorAll("text")]) {
    el.remove();
  }
}

const HEAVY_OPENING_ATTACKS = 9;
const HEAVY_OPENING_KEEP = 5;

/**
 * A bar full of sixteenths or thirty-seconds becomes a short opening:
 * the clef, the time signature, and the first few notes, spaced so each
 * head can be read. Simpler openings are left alone.
 */
export function lightenHeavyOpening(xml: string): string | null {
  const start = xml.search(/<measure\b/i);
  const partEnd = xml.search(/<\/part>/i);
  if (start < 0 || partEnd < 0 || partEnd <= start) return null;
  const region = xml.slice(start, partEnd);
  const closeAt = region.search(/<\/measure>/i);
  if (closeAt < 0) return null;
  const measure = region.slice(0, closeAt + "</measure>".length);
  const notes = [...measure.matchAll(/<note\b[\s\S]*?<\/note>/gi)].map((match) => match[0]);
  const attacks = notes.filter((note) => !isChordTone(note) && !isGrace(note));
  if (attacks.length < HEAVY_OPENING_ATTACKS) return null;

  const kept: string[] = [];
  let seen = 0;
  for (const note of notes) {
    const attack = !isChordTone(note) && !isGrace(note);
    if (attack) {
      if (seen >= HEAVY_OPENING_KEEP) break;
      seen += 1;
    } else if (seen >= HEAVY_OPENING_KEEP) {
      break;
    }
    kept.push(note.replace(/<beam\b[\s\S]*?<\/beam>/gi, ""));
  }
  if (kept.length === 0) return null;

  const openTag = measure.match(/^<measure\b[^>]*>/i)?.[0] ?? "<measure>";
  const attributes = measure.match(/<attributes\b[\s\S]*?<\/attributes>/i)?.[0] ?? "";
  const trimmed = `${openTag}${attributes}${kept.join("")}</measure>`;
  return `${xml.slice(0, start)}${trimmed}${xml.slice(partEnd)}`;
}

function isChordTone(note: string): boolean {
  return /<chord[\s/>]/i.test(note);
}

function isGrace(note: string): boolean {
  return /<grace[\s/>]/i.test(note);
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
  const height = spacing * (4 + SPACES_ABOVE + SPACES_BELOW);
  const fallbackRight = x0 + spacing * SPACES_WIDE;
  const barRight = openingRight(svg, first, x0, fallbackRight);
  const right = unclumpOpening(svg, first, x0, barRight);
  dropLaterMeasures(svg, first, right);
  const frame = expandFrameToWholeNotes(svg, {
    x: x0,
    y: y0,
    width: Math.max(spacing * 4, right - x0),
    height,
    gateLeft: x0 - spacing * 1.5,
    gateTop: first.top - spacing * GATE_ABOVE,
    gateRight: right,
    gateBottom: first.bottom + spacing * GATE_BELOW,
    pad: spacing * 0.4,
    minTop: first.top - spacing * 6.2,
    maxBottom: y0 + height,
  });
  dropMarksOutsideOpening(svg, frame, first);

  svg.setAttribute(
    "viewBox",
    `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
  );
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return true;
}

type Frame = { x: number; y: number; width: number; height: number };

/**
 * Right edge on a barline. Two complete bars when they still read at card
 * size; otherwise the first complete bar. Never a sliced note from the next bar.
 */
function openingRight(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
  x0: number,
  fallbackRight: number,
): number {
  const bars = measureEnds(svg, staff);
  const fromMeasures = bars.length > 0;
  const marks = fromMeasures ? bars : barlineXs(svg, staff);
  const pad = staff.spacing * 0.22;
  const opensAtLeft = !fromMeasures && marks[0] != null && marks[0] <= x0 + staff.spacing * 5;
  const endOf = (barCount: number) =>
    marks[fromMeasures ? barCount - 1 : opensAtLeft ? barCount : barCount - 1];
  const two = endOf(OPENING_BARS);
  const one = endOf(1);
  const twoBarLimit = x0 + staff.spacing * TWO_BAR_MAX_SPACES;
  if (two != null && two <= twoBarLimit) return two + pad;
  if (one != null) return one + pad;
  if (two != null) return two + pad;
  return Math.min(fallbackRight, x0 + staff.spacing * SPACES_WIDE);
}

/**
 * A bar of thirty-second notes fills the card and the heads pile up.
 * Keep the first few heads so they scale up to the same size as a simple tune.
 */
function unclumpOpening(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
  x0: number,
  right: number,
): number {
  const heads = noteHeadXs(svg, staff).filter((x) => x >= x0 - staff.spacing && x <= right);
  if (heads.length < CROWDED_HEADS) return right;
  const last = heads[OPENING_HEADS - 1];
  if (last == null) return right;
  return Math.min(right, last + staff.spacing * 1.55);
}

function noteHeadXs(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
): number[] {
  const xs: number[] = [];
  const high = staff.top - staff.spacing * 5;
  const low = staff.bottom + staff.spacing * 4;
  for (const el of svg.querySelectorAll(".vf-notehead, .vf-stavenote")) {
    const box = userBox(svg, el);
    if (!box) continue;
    const cy = (box.y + box.y1) / 2;
    if (cy < high || cy > low) continue;
    xs.push((box.x + box.x1) / 2);
  }
  xs.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const x of xs) {
    if (unique.length === 0 || x - unique[unique.length - 1]! > staff.spacing * 0.35) {
      unique.push(x);
    }
  }
  return unique;
}

/** Right edge of each measure on this staff. OSMD draws one group per bar. */
function measureEnds(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
): number[] {
  const xs: number[] = [];
  for (const measure of svg.querySelectorAll(".vf-measure")) {
    const edge = measureEdge(measure, svg);
    if (!edge) continue;
    if (edge.y < staff.top - staff.spacing * 0.8) continue;
    if (edge.y > staff.bottom + staff.spacing * 0.8) continue;
    xs.push(edge.x1);
  }
  xs.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const x of xs) {
    if (unique.length === 0 || x - unique[unique.length - 1]! > staff.spacing * 0.8) {
      unique.push(x);
    }
  }
  return unique;
}

function measureEdge(
  measure: Element,
  svg: SVGSVGElement,
): { x0: number; x1: number; y: number } | null {
  for (const path of measure.querySelectorAll("path")) {
    const shift = translationOf(path, svg);
    const seg = horizontalSegment(path);
    if (!seg || Math.abs(seg.x1 - seg.x0) < 24) continue;
    const x0 = Math.min(seg.x0, seg.x1) + shift.x;
    const x1 = Math.max(seg.x0, seg.x1) + shift.x;
    return { x0, x1, y: (seg.y0 + seg.y1) / 2 + shift.y };
  }
  const box = userBox(svg, measure);
  if (!box) return null;
  return { x0: box.x, x1: box.x1, y: (box.y + box.y1) / 2 };
}

function horizontalSegment(
  el: Element,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const match = (el.getAttribute("d") ?? "")
    .trim()
    .match(/^M\s*([-\d.]+)[,\s]+([-\d.]+)\s*[LH]\s*([-\d.]+)[,\s]+([-\d.]+)/i);
  if (!match) return null;
  const x0 = Number(match[1]);
  const y0 = Number(match[2]);
  const x1 = Number(match[3]);
  const y1 = Number(match[4]);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  if (Math.abs(y1 - y0) > 1.25) return null;
  return { x0, y0, x1, y1 };
}

/** Later bars and later systems are removed so a sliced note cannot remain in the card. */
function dropLaterMeasures(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
  right: number,
): void {
  for (const measure of [...svg.querySelectorAll(".vf-measure")]) {
    const edge = measureEdge(measure, svg);
    if (!edge) continue;
    const onFirst =
      edge.y >= staff.top - staff.spacing * 0.8 &&
      edge.y <= staff.bottom + staff.spacing * 0.8;
    if (!onFirst || edge.x0 >= right - staff.spacing * 0.4) measure.remove();
  }
}

/** Barlines on this staff, from engraved paths when layout boxes are empty. */
function barlineXs(
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
): number[] {
  const xs: number[] = [];
  const groups = [...svg.querySelectorAll(".vf-stavebarline")];
  for (const source of groups) {
    xs.push(...verticalLineXs(source, svg, staff));
    const box = userBox(svg, source);
    if (!box) continue;
    const cy = (box.y + box.y1) / 2;
    if (cy < staff.top - staff.spacing || cy > staff.bottom + staff.spacing) continue;
    xs.push(box.x);
  }
  xs.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const x of xs) {
    if (unique.length === 0 || x - unique[unique.length - 1]! > staff.spacing * 0.8) {
      unique.push(x);
    }
  }
  return unique;
}

function verticalLineXs(
  root: Element,
  svg: SVGSVGElement,
  staff: { top: number; bottom: number; spacing: number },
): number[] {
  const xs: number[] = [];
  const nodes =
    root === svg
      ? svg.querySelectorAll("path, line")
      : root.querySelectorAll("path, line");
  for (const el of nodes) {
    const shift = translationOf(el, svg);
    const seg = verticalSegment(el);
    if (!seg) continue;
    const y0 = Math.min(seg.y0, seg.y1) + shift.y;
    const y1 = Math.max(seg.y0, seg.y1) + shift.y;
    if (y1 - y0 < staff.spacing * 2.4) continue;
    if (y0 > staff.top + staff.spacing || y1 < staff.bottom - staff.spacing) continue;
    xs.push(seg.x + shift.x);
  }
  return xs;
}

function verticalSegment(
  el: Element,
): { x: number; y0: number; y1: number } | null {
  if (el.tagName.toLowerCase() === "line") {
    const x1 = Number(el.getAttribute("x1"));
    const x2 = Number(el.getAttribute("x2"));
    const y1 = Number(el.getAttribute("y1"));
    const y2 = Number(el.getAttribute("y2"));
    if (![x1, x2, y1, y2].every(Number.isFinite)) return null;
    if (Math.abs(x2 - x1) > 1.25) return null;
    return { x: (x1 + x2) / 2, y0: y1, y1: y2 };
  }
  const match = (el.getAttribute("d") ?? "")
    .trim()
    .match(/^M\s*([-\d.]+)[,\s]+([-\d.]+)\s*[LH]\s*([-\d.]+)[,\s]+([-\d.]+)\s*$/i);
  if (!match) return null;
  const x0 = Number(match[1]);
  const y0 = Number(match[2]);
  const x1 = Number(match[3]);
  const y1 = Number(match[4]);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  if (Math.abs(x1 - x0) > 1.25) return null;
  return { x: (x0 + x1) / 2, y0, y1 };
}

/** Hairpins and the next bar or system stay off the card, even if they overlap the frame. */
function dropMarksOutsideOpening(
  svg: SVGSVGElement,
  frame: Frame,
  staff: { top: number; bottom: number; spacing: number },
): void {
  svg.querySelectorAll(".vf-hairpin, .vf-pedal, .vf-volta").forEach((el) => {
    el.remove();
  });
  const right = frame.x + frame.width;
  const low = staff.bottom + staff.spacing * 3.1;
  const high = staff.top - staff.spacing * 6.4;
  for (const el of [...svg.querySelectorAll("g")]) {
    const cls = el.getAttribute("class") ?? "";
    if (
      !/(?:^|\s)vf-(?:stavenote|beam|curve|tie|tuplet|articulation|ornament|annotation)(?:\s|$)/.test(
        cls,
      )
    ) {
      continue;
    }
    const box = userBox(svg, el);
    if (!box) continue;
    const cx = (box.x + box.x1) / 2;
    const cy = (box.y + box.y1) / 2;
    if (cx > right - staff.spacing * 0.12 || cy > low || cy < high) el.remove();
  }
}

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
    minTop: number;
    maxBottom: number;
  },
): Frame {
  let x = frame.x;
  let y = frame.y;
  let right = frame.x + frame.width;
  let bottom = Math.min(frame.y + frame.height, frame.maxBottom);
  const glyphs = svg.querySelectorAll("g");
  for (const el of glyphs) {
    if (!isSnippetGlyph(el)) continue;
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
    const cls = el.getAttribute("class") ?? "";
    const spans = /vf-(?:beam|curve|tie|tuplet)(?:\s|$)/.test(cls);
    const boxLeft = spans ? Math.max(box.x, frame.gateLeft) : box.x;
    x = Math.min(x, boxLeft - frame.pad);
    y = Math.max(frame.minTop, Math.min(y, box.y - frame.pad));
    right = Math.min(frame.gateRight, Math.max(right, frame.gateRight));
    bottom = Math.min(frame.maxBottom, Math.max(bottom, box.y1 + frame.pad));
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
