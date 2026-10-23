const INDEX = "data-musai-dynamic-index";

type DynamicSheet = {
  GraphicSheet?: {
    MusicPages?: Array<{
      MusicSystems?: Array<{
        StaffLines?: Array<{
          AbstractExpressions?: unknown[];
        }>;
      }>;
    }>;
  };
};

type ContinuousExpr = {
  ContinuousDynamic?: unknown;
  IsVerbal?: boolean;
  IsSplittedPart?: boolean;
  IsSoftAccent?: boolean;
  Label?: { SVGNode?: Node | null };
  Lines?: Array<{ SVGElement?: Node | null }>;
};

type LetterExpr = {
  Expression?: string;
  Label?: { SVGNode?: Node | null };
  ContinuousDynamic?: unknown;
};

const LETTER =
  /^(?:p{1,6}|f{1,6}|mp|mf|fp|sfz|sf|fz|rfz)$/i;

function tag(node: Node | null | undefined, index: number) {
  if (!(node instanceof Element)) return;
  node.setAttribute(INDEX, String(index));
}

function widenLine(node: Node | null | undefined, index: number) {
  tag(node, index);
  if (!(node instanceof Element) || node.tagName.toLowerCase() !== "line" || !node.parentNode) {
    return;
  }
  const hit = node.cloneNode() as Element;
  hit.setAttribute("stroke", "transparent");
  hit.setAttribute("stroke-width", "14");
  hit.setAttribute("pointer-events", "stroke");
  hit.setAttribute("data-musai-dynamic-hit", "true");
  hit.setAttribute(INDEX, String(index));
  node.parentNode.appendChild(hit);
}

/**
 * Mark engraved dynamic letters and hairpins in score order.
 * OpenSheetMusicDisplay draws letters as text and hairpins as lines,
 * so the paint cannot look them up by a VexFlow class.
 */
export function tagEngravedDynamics(osmd: unknown) {
  const sheet = osmd as DynamicSheet | null | undefined;
  const pages = sheet?.GraphicSheet?.MusicPages ?? [];
  const seen = new Map<unknown, number>();
  let next = 0;
  let lastHairpin: number | null = null;

  const indexFor = (source: unknown, split: boolean) => {
    if (source != null && seen.has(source)) return seen.get(source)!;
    if (split && lastHairpin != null) return lastHairpin;
    const index = next;
    next += 1;
    if (source != null) seen.set(source, index);
    lastHairpin = index;
    return index;
  };

  for (const page of pages) {
    for (const system of page.MusicSystems ?? []) {
      const line = system.StaffLines?.[0];
      if (!line) continue;
      for (const expr of line.AbstractExpressions ?? []) {
        const continuous = expr as ContinuousExpr;
        if (continuous.ContinuousDynamic) {
          if (continuous.IsSoftAccent) continue;
          const index = indexFor(
            continuous.ContinuousDynamic,
            Boolean(continuous.IsSplittedPart),
          );
          if (continuous.IsVerbal) {
            tag(continuous.Label?.SVGNode, index);
          } else {
            for (const segment of continuous.Lines ?? []) {
              widenLine(segment.SVGElement, index);
            }
          }
          continue;
        }
        const letter = expr as LetterExpr;
        if (
          typeof letter.Expression === "string" &&
          LETTER.test(letter.Expression)
        ) {
          const index = next;
          next += 1;
          tag(letter.Label?.SVGNode, index);
        }
      }
    }
  }
}
