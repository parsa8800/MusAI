import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";
import type { PitchNoteMark } from "@/features/piece-studio/feedback/visual/piecePitchScoreMap";
import { collectNoteheadTargets } from "@/features/piece-studio/score/noteheadPoses";

const NOTEHEAD_SELECTORS = [
  "g.vf-notehead",
  "path.vf-notehead",
  "ellipse.vf-notehead",
  ".vf-notehead",
  '[class*="vf-notehead"]',
].join(", ");

const ATTR = "data-musai-pitch-kind";

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

function paintElement(el: Element, kind: string) {
  el.setAttribute(ATTR, kind);
  const color = `var(--musai-pitch-${kind})`;
  const targets =
    el.tagName.toLowerCase() === "g"
      ? [...el.querySelectorAll("path, ellipse, use")]
      : [el];
  for (const node of targets) {
    if (!(node instanceof SVGElement)) continue;
    node.style.setProperty("fill", color, "important");
    node.style.setProperty("stroke", color, "important");
    node.style.setProperty("color", color, "important");
    // OSMD often bakes fill attributes — override so Scale-style ink sticks.
    if (node.hasAttribute("fill") && node.getAttribute("fill") !== "none") {
      node.setAttribute("fill", color);
    }
    if (node.hasAttribute("stroke") && node.getAttribute("stroke") !== "none") {
      node.setAttribute("stroke", color);
    }
  }
}

/** Notehead plus its stem, the same ink Scale Studio uses for that note. */
function paintNote(el: Element, kind: string) {
  paintElement(el, kind);
  const note = el.closest(".vf-stavenote, .vf-note");
  if (!note || note === el) return;
  for (const stem of note.querySelectorAll(".vf-stem, .vf-flag")) {
    paintElement(stem, kind);
  }
}

/** Clear previous pitch tints from engraved noteheads. */
export function clearPitchNoteheadTints(wrap: HTMLElement | null) {
  if (!wrap) return;
  for (const el of wrap.querySelectorAll(`[${ATTR}]`)) {
    el.removeAttribute(ATTR);
    const targets =
      el.tagName.toLowerCase() === "g"
        ? [...el.querySelectorAll("path, ellipse, use")]
        : [el];
    for (const node of targets) {
      if (!(node instanceof SVGElement)) continue;
      node.style.removeProperty("fill");
      node.style.removeProperty("stroke");
      node.style.removeProperty("color");
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
        paintNote(head.el, mark.kind);
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
    paintNote(head.el, mark.kind);
  }
}
