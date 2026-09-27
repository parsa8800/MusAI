/**
 * Clean crowded / conflicting dynamics that OMR often invents (e.g. mf+p
 * stacked above the first notes when a single below “p” is correct).
 *
 * Rules:
 * - Strip the MusicXML DOCTYPE before parsing (browsers can fail the DTD fetch
 *   and leave the score unsanitised).
 * - Within a measure, collapse dynamics that land within ~two sounding notes.
 * - Prefer `placement="below"` when replacing a cluster.
 * - Measure 1 keeps at most one dynamic mark (OMR is noisiest at the opening).
 */

const DYNAMIC_CHILD =
  /<(?:p|pp|ppp|f|ff|fff|mp|mf|sf|sfz|fp|rf|rfz)\b/i;

function stripDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE[^>]*>/i, "");
}

function isDynamicDirection(el: Element): boolean {
  if (el.tagName !== "direction") return false;
  const dyn = el.getElementsByTagName("dynamics")[0];
  if (!dyn) return false;
  const markup = dyn.innerHTML || dyn.textContent || "";
  return DYNAMIC_CHILD.test(markup) || dyn.children.length > 0;
}

function directionPlacement(el: Element): "above" | "below" | "other" {
  const raw = (el.getAttribute("placement") || "").toLowerCase();
  if (raw === "above") return "above";
  if (raw === "below") return "below";
  return "other";
}

function preferDynamic(a: Element, b: Element): Element {
  const pa = directionPlacement(a);
  const pb = directionPlacement(b);
  if (pa === "below" && pb !== "below") return a;
  if (pb === "below" && pa !== "below") return b;
  return a;
}

function isSoundingNote(el: Element): boolean {
  if (el.tagName !== "note") return false;
  for (const child of el.children) {
    if (
      child.tagName === "chord" ||
      child.tagName === "grace" ||
      child.tagName === "rest"
    ) {
      return false;
    }
  }
  return true;
}

function sanitizeMeasureDynamics(measure: Element, isFirstMeasure: boolean): void {
  let noteIndex = 0;
  let lastKeptAt = -999;
  let kept: Element | null = null;
  const remove: Element[] = [];
  const allDynamicDirs: Element[] = [];

  for (const el of [...measure.children]) {
    if (isSoundingNote(el)) {
      noteIndex += 1;
      continue;
    }
    if (!isDynamicDirection(el)) continue;
    allDynamicDirs.push(el);

    if (kept && noteIndex - lastKeptAt <= 2) {
      const winner = preferDynamic(kept, el);
      if (winner === kept) {
        remove.push(el);
      } else {
        remove.push(kept);
        kept = el;
        lastKeptAt = noteIndex;
      }
      continue;
    }

    kept = el;
    lastKeptAt = noteIndex;
  }

  // Opening bar: OMR almost always invents a stack — keep a single mark.
  if (isFirstMeasure && allDynamicDirs.length > 1) {
    let winner = allDynamicDirs[0]!;
    for (const el of allDynamicDirs.slice(1)) {
      winner = preferDynamic(winner, el);
    }
    for (const el of allDynamicDirs) {
      if (el !== winner && !remove.includes(el)) remove.push(el);
    }
  }

  for (const el of remove) {
    el.parentNode?.removeChild(el);
  }
}

/**
 * Strip OMR-style stacked dynamics from MusicXML. Safe no-op when DOMParser
 * is missing (Node API routes) or the document is not score-partwise.
 */
export function sanitizeMusicXmlDynamics(musicXml: string): string {
  if (typeof DOMParser === "undefined") return musicXml;
  const prepared = stripDoctype(musicXml);
  const doc = new DOMParser().parseFromString(prepared, "application/xml");
  if (doc.querySelector("parsererror")) return musicXml;
  const root =
    doc.querySelector("score-partwise") ?? doc.querySelector("score-timewise");
  if (!root) return musicXml;

  const measures = [...root.querySelectorAll("measure")];
  measures.forEach((measure, index) => {
    sanitizeMeasureDynamics(measure, index === 0);
  });

  const serialized = new XMLSerializer().serializeToString(doc);
  // Preserve XML declaration when the source had one.
  if (/^\s*<\?xml/i.test(musicXml) && !/^\s*<\?xml/i.test(serialized)) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
  }
  return serialized;
}
