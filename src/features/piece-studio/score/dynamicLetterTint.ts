import type { DynamicLetterMark } from "@/features/piece-studio/feedback/visual/pieceDynamicsScoreMap";

const ATTR = "data-musai-dynamic";

const DYNAMIC_SELECTORS = ["g.vf-dynamic", ".vf-dynamic"].join(", ");

function letters(wrap: HTMLElement): Element[] {
  const found = [...wrap.querySelectorAll(DYNAMIC_SELECTORS)];
  return found.filter((el) => !el.parentElement?.closest(".vf-dynamic"));
}

function paintLetter(el: Element, kind: DynamicLetterMark["kind"]) {
  el.setAttribute(ATTR, kind);
  const color = "var(--musai-dynamic-wrong)";
  const targets = [
    el,
    ...el.querySelectorAll("text, path, use, tspan"),
  ];
  for (const node of targets) {
    if (!(node instanceof SVGElement)) continue;
    node.style.setProperty("fill", color, "important");
    node.style.setProperty("color", color, "important");
    if (node.getAttribute("fill") !== "none") {
      node.setAttribute("fill", color);
    }
  }
}

export function clearDynamicLetterTints(wrap: HTMLElement | null) {
  if (!wrap) return;
  for (const el of wrap.querySelectorAll(`[${ATTR}]`)) {
    el.removeAttribute(ATTR);
    const targets = [
      el,
      ...el.querySelectorAll("text, path, use, tspan"),
    ];
    for (const node of targets) {
      if (!(node instanceof SVGElement)) continue;
      node.style.removeProperty("fill");
      node.style.removeProperty("color");
    }
  }
}

/** Colour a wrong written dynamic. Notes and rhythm rectangles are left alone. */
export function applyDynamicLetterTints(
  wrap: HTMLElement | null,
  marks: readonly DynamicLetterMark[],
) {
  if (!wrap) return;
  clearDynamicLetterTints(wrap);
  if (marks.length === 0) return;
  const glyphs = letters(wrap);
  for (const mark of marks) {
    const glyph = glyphs[mark.regionIndex];
    if (!glyph) continue;
    paintLetter(glyph, mark.kind);
  }
}
