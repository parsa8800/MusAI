import type { DynamicLetterMark } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";

const INDEX = "data-musai-dynamic-index";
const MARK = "data-musai-dynamic";
const ISSUE = "data-musai-dynamic-issue";
const PREV_FILL = "data-musai-prev-fill";
const PREV_STROKE = "data-musai-prev-stroke";

const WRONG = "var(--musai-danger)";

function painted(wrap: HTMLElement): Element[] {
  return [...wrap.querySelectorAll(`[${MARK}]`)];
}

function remember(node: SVGElement, attr: string, store: string) {
  if (node.hasAttribute(store)) return;
  node.setAttribute(store, node.getAttribute(attr) ?? "");
}

function restore(node: SVGElement, attr: string, store: string) {
  if (!node.hasAttribute(store)) return;
  const prev = node.getAttribute(store) ?? "";
  if (prev) node.setAttribute(attr, prev);
  else node.removeAttribute(attr);
  node.removeAttribute(store);
}

function paintNode(node: SVGElement, hit: boolean) {
  node.style.cursor = "pointer";
  if (hit) return;
  const tag = node.tagName.toLowerCase();
  const paintStroke =
    tag === "line" ||
    tag === "path" ||
    tag === "polyline" ||
    (node.getAttribute("stroke") != null && node.getAttribute("stroke") !== "none");
  if (paintStroke) {
    remember(node, "stroke", PREV_STROKE);
    node.style.setProperty("stroke", WRONG, "important");
    if (node.getAttribute("stroke") !== "none") node.setAttribute("stroke", WRONG);
  }
  if (node.getAttribute("fill") === "none" && paintStroke) return;
  remember(node, "fill", PREV_FILL);
  node.style.setProperty("fill", WRONG, "important");
  node.style.setProperty("color", WRONG, "important");
  if (node.getAttribute("fill") !== "none") node.setAttribute("fill", WRONG);
}

function clearNode(node: SVGElement) {
  node.style.removeProperty("fill");
  node.style.removeProperty("color");
  node.style.removeProperty("stroke");
  node.style.removeProperty("cursor");
  restore(node, "fill", PREV_FILL);
  restore(node, "stroke", PREV_STROKE);
}

export type DynamicGlyphBox = {
  issueId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DynamicPressTarget = DynamicGlyphBox;

const MIN_PRESS_W = 44;
const MIN_PRESS_H = 36;

function padPressBox(box: DynamicGlyphBox): DynamicPressTarget {
  const width = Math.max(box.width + 12, MIN_PRESS_W);
  const height = Math.max(box.height + 12, MIN_PRESS_H);
  return {
    issueId: box.issueId,
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  };
}

function nearEnough(a: DynamicGlyphBox, b: DynamicGlyphBox): boolean {
  const vertGap =
    Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  const horizGap =
    Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  return vertGap < 28 && horizGap < 24;
}

function unionBox(a: DynamicGlyphBox, b: DynamicGlyphBox): DynamicGlyphBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { issueId: a.issueId, x, y, width: right - x, height: bottom - y };
}

/** One finger target per mark. A wedge split onto the next system stays two targets. */
export function pressBoxesForMarks(
  glyphs: readonly DynamicGlyphBox[],
): DynamicPressTarget[] {
  const byIssue = new Map<string, DynamicGlyphBox[]>();
  for (const glyph of glyphs) {
    if (!glyph.issueId || glyph.width < 0.5 || glyph.height < 0.5) continue;
    const list = byIssue.get(glyph.issueId) ?? [];
    list.push(glyph);
    byIssue.set(glyph.issueId, list);
  }
  const out: DynamicPressTarget[] = [];
  for (const boxes of byIssue.values()) {
    const clusters: DynamicGlyphBox[] = [];
    for (const box of boxes) {
      const hit = clusters.findIndex((cluster) => nearEnough(cluster, box));
      if (hit < 0) clusters.push({ ...box });
      else clusters[hit] = unionBox(clusters[hit]!, box);
    }
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          if (!nearEnough(clusters[i]!, clusters[j]!)) continue;
          clusters[i] = unionBox(clusters[i]!, clusters[j]!);
          clusters.splice(j, 1);
          merged = true;
          break;
        }
        if (merged) break;
      }
    }
    for (const cluster of clusters) out.push(padPressBox(cluster));
  }
  return out;
}

/** Boxes in the score wrap, ready to sit above the playhead and rhythm rectangles. */
export function dynamicPressTargets(wrap: HTMLElement): DynamicPressTarget[] {
  const wrapRect = wrap.getBoundingClientRect();
  const glyphs: DynamicGlyphBox[] = [];
  for (const el of wrap.querySelectorAll(`[${MARK}]`)) {
    if (!(el instanceof Element)) continue;
    if (el.getAttribute("data-musai-dynamic-hit") === "true") continue;
    if (el.parentElement?.closest(`[${MARK}]`)) continue;
    const issueId = el.getAttribute(ISSUE) ?? "";
    if (!issueId) continue;
    const rect = el.getBoundingClientRect();
    glyphs.push({
      issueId,
      x: rect.left - wrapRect.left + wrap.scrollLeft,
      y: rect.top - wrapRect.top + wrap.scrollTop,
      width: rect.width,
      height: rect.height,
    });
  }
  return pressBoxesForMarks(glyphs);
}

export function clearDynamicLetterTints(wrap: HTMLElement | null) {
  if (!wrap) return;
  for (const el of painted(wrap)) {
    el.removeAttribute(MARK);
    el.removeAttribute(ISSUE);
    const targets = [el, ...el.querySelectorAll("text, path, use, tspan, line")];
    for (const node of targets) {
      if (!(node instanceof SVGElement)) continue;
      clearNode(node);
    }
  }
}

/**
 * Colour a written dynamic that was not followed.
 * Glyphs are tagged with data-musai-dynamic-index after engraving.
 * Notes and rhythm rectangles are left alone.
 */
export function applyDynamicLetterTints(
  wrap: HTMLElement | null,
  marks: readonly DynamicLetterMark[],
) {
  if (!wrap) return;
  clearDynamicLetterTints(wrap);
  if (marks.length === 0) return;
  for (const mark of marks) {
    const glyphs = wrap.querySelectorAll(`[${INDEX}="${mark.regionIndex}"]`);
    for (const glyph of glyphs) {
      glyph.setAttribute(MARK, "wrong");
      glyph.setAttribute(ISSUE, mark.issueId);
      const hit = glyph.getAttribute("data-musai-dynamic-hit") === "true";
      const targets = [
        glyph,
        ...glyph.querySelectorAll("text, path, use, tspan, line"),
      ];
      for (const node of targets) {
        if (!(node instanceof SVGElement)) continue;
        paintNode(node, hit);
      }
    }
  }
}
