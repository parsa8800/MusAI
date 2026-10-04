import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import type { PitchNoteMark } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import { collectNoteheadTargets } from "@/features/piece-studio/score/noteheadPoses";
import {
  pieceOsmdInk,
  readPieceOsmdTheme,
} from "@/features/piece-studio/score/osmdTheme";

const NOTEHEAD_SELECTORS = [
  "g.vf-notehead",
  "path.vf-notehead",
  "ellipse.vf-notehead",
  ".vf-notehead",
  '[class*="vf-notehead"]',
].join(", ");

const ATTR = "data-musai-pitch-kind";
const FILL_MEMORY = "data-musai-pitch-fill";
const STROKE_MEMORY = "data-musai-pitch-stroke";

function isPitchPaint(value: string | null | undefined): boolean {
  return Boolean(value && value.includes("--musai-pitch-"));
}

function paintTargets(el: Element): SVGElement[] {
  const targets =
    el.tagName.toLowerCase() === "g"
      ? [...el.querySelectorAll("path, ellipse, use")]
      : [el];
  return targets.filter((node): node is SVGElement => node instanceof SVGElement);
}

function engravingInk(wrap: HTMLElement): string {
  const stem = wrap.querySelector(".vf-stem path, .vf-stem");
  const fromStem = stem?.getAttribute("stroke") || stem?.getAttribute("fill");
  if (fromStem && !isPitchPaint(fromStem) && fromStem !== "none") return fromStem;
  return pieceOsmdInk(readPieceOsmdTheme());
}

function rememberInk(node: SVGElement, attr: "fill" | "stroke", ink: string) {
  const key = attr === "fill" ? FILL_MEMORY : STROKE_MEMORY;
  if (node.hasAttribute(key)) return;
  const current = node.getAttribute(attr);
  if (current == null) {
    node.setAttribute(key, "");
    return;
  }
  node.setAttribute(key, isPitchPaint(current) ? ink : current);
}

function restoreAttr(
  node: SVGElement,
  attr: "fill" | "stroke",
  key: string,
  ink: string,
) {
  if (node.hasAttribute(key)) {
    const saved = node.getAttribute(key) ?? "";
    node.removeAttribute(key);
    if (!saved) node.removeAttribute(attr);
    else node.setAttribute(attr, isPitchPaint(saved) ? ink : saved);
    return;
  }
  if (isPitchPaint(node.getAttribute(attr))) node.setAttribute(attr, ink);
}

function restoreNode(node: SVGElement, ink: string) {
  node.style.removeProperty("fill");
  node.style.removeProperty("stroke");
  node.style.removeProperty("color");
  restoreAttr(node, "fill", FILL_MEMORY, ink);
  restoreAttr(node, "stroke", STROKE_MEMORY, ink);
}

type HeadNode = {
  el: Element;
  x: number;
  y: number;
  width: number;
  height: number;
};

function collectHeads(wrap: HTMLElement): HeadNode[] {
  const host =
    wrap.querySelector<HTMLElement>(".musai-piece-osmd") ?? wrap;
  const svg = host.querySelector("svg");
  if (!svg) return [];
  const wrapRect = wrap.getBoundingClientRect();
  let nodes = [...svg.querySelectorAll(NOTEHEAD_SELECTORS)];
  if (nodes.length < 2) {
    nodes = [...svg.querySelectorAll("g.vf-stavenote, g.vf-note")];
  }
  const raw: HeadNode[] = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    const width = Math.max(r.width, 1);
    const height = Math.max(r.height, 1);
    const x = r.left - wrapRect.left + wrap.scrollLeft + width * 0.5;
    const y = r.top - wrapRect.top + wrap.scrollTop + height * 0.5;
    raw.push({ el, x, y, width, height });
  }
  raw.sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > 56) return dy;
    return a.x - b.x;
  });
  const out: HeadNode[] = [];
  for (const p of raw) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 8 && Math.abs(prev.y - p.y) < 36) {
      continue;
    }
    out.push(p);
  }
  return out;
}

function nearestSnap(
  snaps: readonly CursorPose[],
  tSec: number,
): CursorPose | null {
  if (snaps.length === 0) return null;
  let best = snaps[0]!;
  let bestD = Math.abs(best.tSec - tSec);
  for (const snap of snaps) {
    const d = Math.abs(snap.tSec - tSec);
    if (d < bestD) {
      best = snap;
      bestD = d;
    }
  }
  return best;
}

function nearestHead(heads: readonly HeadNode[], snap: CursorPose): HeadNode | null {
  if (heads.length === 0) return null;
  const cy = snap.y + snap.height * 0.5;
  let best: HeadNode | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const h of heads) {
    const dx = h.x - snap.x;
    const dy = h.y - cy;
    const d = dx * dx + dy * dy * 4;
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

function paintElement(el: Element, kind: string, ink: string) {
  el.setAttribute(ATTR, kind);
  const color = `var(--musai-pitch-${kind})`;
  for (const node of paintTargets(el)) {
    rememberInk(node, "fill", ink);
    rememberInk(node, "stroke", ink);
    node.style.setProperty("fill", color, "important");
    node.style.setProperty("stroke", color, "important");
    node.style.setProperty("color", color, "important");
    // OSMD often bakes fill attributes — override so the colour sticks.
    if (node.hasAttribute("fill") && node.getAttribute("fill") !== "none") {
      node.setAttribute("fill", color);
    }
    if (node.hasAttribute("stroke") && node.getAttribute("stroke") !== "none") {
      node.setAttribute("stroke", color);
    }
  }
}

/** Colour the notehead only. Stems, flags, and beams stay the engraving ink. */
function paintNote(el: Element, kind: string, ink: string) {
  paintElement(el, kind, ink);
}

/** Clear previous pitch tints and put the engraved ink back. */
export function clearPitchNoteheadTints(wrap: HTMLElement | null) {
  if (!wrap) return;
  const ink = engravingInk(wrap);
  for (const el of wrap.querySelectorAll(`[${ATTR}]`)) {
    el.removeAttribute(ATTR);
    for (const node of paintTargets(el)) restoreNode(node, ink);
  }
  for (const node of wrap.querySelectorAll("path, ellipse, use")) {
    if (!(node instanceof SVGElement)) continue;
    if (
      isPitchPaint(node.getAttribute("fill")) ||
      isPitchPaint(node.getAttribute("stroke")) ||
      isPitchPaint(node.style.fill) ||
      isPitchPaint(node.style.stroke) ||
      node.hasAttribute(FILL_MEMORY) ||
      node.hasAttribute(STROKE_MEMORY)
    ) {
      restoreNode(node, ink);
    }
  }
}

/**
 * Colour engraved noteheads by pitch kind (sharp / flat / missed).
 * No overlay circles — ink on the head itself.
 */
export function applyPitchNoteheadTints(
  wrap: HTMLElement | null,
  snaps: readonly CursorPose[],
  marks: readonly PitchNoteMark[],
  wholeNotesToSeconds: (wn: number) => number,
) {
  if (!wrap) return;
  clearPitchNoteheadTints(wrap);
  if (marks.length === 0) return;
  const ink = engravingInk(wrap);
  const indexed = marks.filter(
    (mark): mark is PitchNoteMark & { noteIndex: number } =>
      typeof mark.noteIndex === "number",
  );
  if (indexed.length > 0) {
    const heads = collectNoteheadTargets(wrap);
    if (heads.length > 0) {
      for (const mark of indexed) {
        const head = heads[mark.noteIndex];
        if (!head) continue;
        paintNote(head.el, mark.kind, ink);
      }
      return;
    }
  }
  if (snaps.length === 0) return;
  const heads = collectHeads(wrap);
  if (heads.length === 0) return;

  const used = new Set<Element>();
  for (const mark of marks) {
    const t = wholeNotesToSeconds(
      (mark.startWholeNotes + mark.endWholeNotes) * 0.5,
    );
    const snap = nearestSnap(snaps, t);
    if (!snap) continue;
    const head = nearestHead(heads, snap);
    if (!head || used.has(head.el)) continue;
    used.add(head.el);
    paintNote(head.el, mark.kind, ink);
  }
}
