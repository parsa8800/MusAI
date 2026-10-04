/**
 * Merge Audiveris multi-movement exports into one score-partwise MusicXML.
 *
 * Caprices / theme+variations often become score.mvt1.mxl … score.mvtN.mxl.
 * Piece Studio expects a single continuous score, so we concatenate measures
 * in movement order and renumber them, then scrub layout so OSMD can engrave.
 */

const ENGRAVING_DIVISIONS = 24;

/**
 * @param {string[]} scores MusicXML texts (already decoded from .mxl / .xml)
 * @returns {string | null}
 */
export function mergePartwiseScores(scores) {
  const usable = (scores || []).filter(
    (s) => typeof s === "string" && looksPartwise(s),
  );
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0];

  const head = usable[0];
  const partIds = extractPartIds(head);
  if (partIds.length === 0) return head;

  /** @type {Map<string, string[]>} */
  const measuresByPart = new Map(partIds.map((id) => [id, []]));

  for (const score of usable) {
    for (const partId of partIds) {
      const measures = extractMeasuresForPart(score, partId);
      const bucket = measuresByPart.get(partId);
      if (bucket) bucket.push(...measures);
    }
  }

  /** @type {string[]} */
  const partBlocks = [];
  for (const partId of partIds) {
    const raw = measuresByPart.get(partId) || [];
    const renumbered = raw.map((measureXml, index) => {
      const isLast = index === raw.length - 1;
      let body = setMeasureNumber(measureXml, index + 1);
      // Soften movement-final double bars except on the true last measure.
      if (!isLast) {
        body = softenFinalBarline(body);
      }
      return body;
    });
    partBlocks.push(
      `  <part id="${escapeAttr(partId)}">\n${renumbered.join("\n")}\n  </part>`,
    );
  }

  const preamble = extractPreamble(head);
  if (!preamble) return head;

  const merged = `${preamble}\n${partBlocks.join("\n")}\n</score-partwise>\n`;
  return prepareMergedScoreForEngraving(merged);
}

/**
 * Prefer merging every `.mvtN` export when Audiveris splits a book.
 * @param {{ name: string, text: string }[]} exports
 * @returns {string | null}
 */
export function pickOrMergeExportedScores(exports) {
  const valid = (exports || []).filter(
    (e) => e && typeof e.text === "string" && looksPartwise(e.text),
  );
  if (valid.length === 0) return null;

  const withMvt = valid
    .map((e) => ({ ...e, mvt: movementIndex(e.name) }))
    .filter((e) => e.mvt != null);

  if (withMvt.length > 1) {
    withMvt.sort((a, b) => a.mvt - b.mvt || a.name.localeCompare(b.name));
    return mergePartwiseScores(withMvt.map((e) => e.text));
  }

  if (withMvt.length === 1) {
    return prepareMergedScoreForEngraving(withMvt[0].text);
  }

  const withPage = valid
    .map((e) => ({ ...e, page: pageFileIndex(e.name) }))
    .filter((e) => e.page != null);
  if (withPage.length > 1 && withPage.length === valid.length) {
    withPage.sort((a, b) => a.page - b.page || a.name.localeCompare(b.name));
    return mergePartwiseScores(withPage.map((e) => e.text));
  }

  // Single unbroken export (or several non-mvt files — take the richest).
  valid.sort(
    (a, b) =>
      measureCount(b.text) - measureCount(a.text) || a.name.localeCompare(b.name),
  );
  return prepareMergedScoreForEngraving(valid[0].text);
}

export function movementIndex(fileName) {
  const match = String(fileName || "").match(/\.mvt(\d+)\b/i);
  if (!match) return null;
  return Number(match[1]);
}

/** Raster page images are named page-1.png → page-1.mxl. */
export function pageFileIndex(fileName) {
  const base = String(fileName || "").split("/").pop() || "";
  const match = base.match(/^page-(\d+)\b/i);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Make a multi-movement merge safe for OpenSheetMusicDisplay.
 *
 * Audiveris variations each carry their own divisions / page prints / empty
 * measures. Concatenating them raw crashes OSMD (`getStave` / `staffEntries`).
 * Printed line breaks are kept. Staccato dots and fermatas from a scan are
 * often not on the page, so those are removed. Dynamics and hairpins stay.
 */
export function prepareMergedScoreForEngraving(xml) {
  if (!xml || !looksPartwise(xml)) return xml;
  let out = stripDoctype(xml);
  out = normalizeDivisions(out, ENGRAVING_DIVISIONS);
  out = stripPrintBlocks(out);
  out = stripScannerMarks(out);
  out = stripLeftBarlines(out);
  out = stripStaffDetails(out);
  out = closeUnmatchedOctaveShifts(out);
  out = keepMusicalAttributes(out);
  out = sanitizeGraceNotes(out);
  out = repairTupletMarkers(out);
  out = fixIllegalBeams(out);
  out = fillEmptyMeasures(out, ENGRAVING_DIVISIONS);
  return out;
}

function looksPartwise(text) {
  return /<score-partwise\b/i.test(text);
}

function measureCount(text) {
  return (text.match(/<measure(?=[\s>])/gi) || []).length;
}

function stripDoctype(xml) {
  return xml.replace(/<!DOCTYPE[^>]*>/i, "");
}

function stripPrintBlocks(xml) {
  const keepBreak = (_full, attrs) => {
    const flags = [];
    if (/\bnew-system\s*=\s*["']yes["']/i.test(attrs)) {
      flags.push('new-system="yes"');
    }
    if (/\bnew-page\s*=\s*["']yes["']/i.test(attrs)) {
      flags.push('new-page="yes"');
    }
    return flags.length > 0 ? `<print ${flags.join(" ")}/>` : "";
  };
  return xml
    .replace(/<print\b([^>]*?)\/>/gi, keepBreak)
    .replace(/<print\b([^>]*)>([\s\S]*?)<\/print>/gi, keepBreak);
}

function stripScannerMarks(xml) {
  return xml
    .replace(/<articulations\b[^>]*\/>/gi, "")
    .replace(/<articulations\b[\s\S]*?<\/articulations>/gi, "")
    .replace(/<fermata\b[^>]*\/>/gi, "")
    .replace(/<fermata\b[\s\S]*?<\/fermata>/gi, "");
}

function stripLeftBarlines(xml) {
  return xml.replace(
    /<barline\b[^>]*location\s*=\s*"left"[^>]*>[\s\S]*?<\/barline>/gi,
    "",
  );
}

function stripStaffDetails(xml) {
  return xml
    .replace(/<staff-details\b[^>]*\/>/gi, "")
    .replace(/<staff-details\b[\s\S]*?<\/staff-details>/gi, "");
}

/**
 * Unmatched 8va pairs crash OSMD getStave. Keep balanced shifts so written
 * octaves stay put.
 */
export function closeUnmatchedOctaveShifts(xml) {
  const starts = (xml.match(/<octave-shift\b[^>]*type="(?:up|down)"/gi) || [])
    .length;
  const stops = (xml.match(/<octave-shift\b[^>]*type="stop"/gi) || []).length;
  if (starts === stops) return xml;
  return xml.replace(/<direction\b[\s\S]*?<\/direction>/gi, (block) =>
    /<octave-shift\b/i.test(block) ? "" : block,
  );
}

/** Keep later key/time/clef changes; drop duplicate divisions after normalize. */
export function keepMusicalAttributes(xml) {
  let seenFirst = false;
  let lastKey = "";
  let lastTime = "";
  let lastClef = "";
  return xml.replace(/<attributes>[\s\S]*?<\/attributes>/gi, (block) => {
    const divisions = block.match(/<divisions>[\s\S]*?<\/divisions>/i)?.[0] || "";
    const key = block.match(/<key\b[\s\S]*?<\/key>/i)?.[0] || "";
    const time = block.match(/<time\b[\s\S]*?<\/time>/i)?.[0] || "";
    const clef = [...block.matchAll(/<clef\b[\s\S]*?<\/clef>/gi)]
      .map((m) => m[0])
      .join("");
    if (!seenFirst) {
      seenFirst = true;
      lastKey = key;
      lastTime = time;
      lastClef = clef;
      const inner = [divisions, key, time, clef].filter(Boolean).join("");
      return inner ? `<attributes>${inner}</attributes>` : "";
    }
    const parts = [];
    if (key && key !== lastKey) {
      parts.push(key);
      lastKey = key;
    }
    if (time && time !== lastTime) {
      parts.push(time);
      lastTime = time;
    }
    if (clef && clef !== lastClef) {
      parts.push(clef);
      lastClef = clef;
    }
    if (parts.length === 0) return "";
    return `<attributes>${parts.join("")}</attributes>`;
  });
}

/** Display-only grace cleanup — do not rewrite following chord notes. */
export function sanitizeGraceNotes(xml) {
  return xml.replace(/<note\b[^>]*>[\s\S]*?<\/note>/gi, (note) => {
    if (!/<grace\b/i.test(note)) return note;
    let out = note.replace(/<grace(\s[^>]*)?\/>/i, '<grace slash="yes"/>');
    out = out.replace(
      /<type>\s*(whole|half|quarter|eighth)\s*<\/type>/i,
      "<type>16th</type>",
    );
    out = out
      .replace(/<beam\b[^>]*\/>/gi, "")
      .replace(/<beam\b[\s\S]*?<\/beam>/gi, "");
    return out;
  });
}

/** Drop orphaned tuplet brackets; keep time-modification so rhythm is intact. */
export function repairTupletMarkers(xml) {
  return xml
    .replace(/<tuplet\b[^>]*\/>/gi, "")
    .replace(/<tuplet\b[\s\S]*?<\/tuplet>/gi, "")
    .replace(/<notations>\s*<\/notations>/gi, "");
}

/** Strip beams from long notes / chord heads / graces (VexFlow rejects them). */
export function fixIllegalBeams(xml) {
  return xml.replace(/<note\b[^>]*>[\s\S]*?<\/note>/gi, (note) => {
    if (/<chord\s*\/>/i.test(note) || /<grace\b/i.test(note)) {
      return note
        .replace(/<beam\b[^>]*\/>/gi, "")
        .replace(/<beam\b[\s\S]*?<\/beam>/gi, "");
    }
    const type = (
      note.match(/<type[^>]*>\s*([^<\s]+)\s*<\/type>/i) || []
    )[1]?.toLowerCase();
    const short = ["eighth", "16th", "32nd", "64th", "128th", "256th"].includes(
      type || "",
    );
    if (short) return note;
    return note
      .replace(/<beam\b[^>]*\/>/gi, "")
      .replace(/<beam\b[\s\S]*?<\/beam>/gi, "");
  });
}

/**
 * Scale every measure’s durations onto a shared divisions value so mid-score
 * attributes can be dropped without scrambling rhythm.
 */
export function normalizeDivisions(xml, target = ENGRAVING_DIVISIONS) {
  let cur = null;
  return xml.replace(
    /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/gi,
    (full, attrs, body) => {
      const divMatch = body.match(/<divisions>(\d+)<\/divisions>/i);
      if (divMatch) cur = Number(divMatch[1]);
      if (cur == null || !(cur > 0)) cur = target;
      const scale = target / cur;
      let next = body.replace(
        /<divisions>\d+<\/divisions>/gi,
        `<divisions>${target}</divisions>`,
      );
      next = next.replace(/<duration>(\d+)<\/duration>/gi, (_, d) => {
        const scaled = Math.max(1, Math.round(Number(d) * scale));
        return `<duration>${scaled}</duration>`;
      });
      return `<measure${attrs}>${next}</measure>`;
    },
  );
}

function voiceTimelineDuration(measureBody) {
  let t = 0;
  const tokens = [
    ...measureBody.matchAll(/<(note|backup|forward)\b[\s\S]*?<\/\1>/gi),
  ].map((m) => m[0]);
  for (const tok of tokens) {
    const dur = Number((tok.match(/<duration>(\d+)/i) || [])[1] || 0);
    if (tok.startsWith("<note")) {
      if (/<chord\s*\/>/i.test(tok) || /<grace\b/i.test(tok)) continue;
      t += dur;
    } else if (tok.startsWith("<backup")) {
      t -= dur;
    } else {
      t += dur;
    }
  }
  return Math.max(0, t);
}

function inferBarDuration(xml, divisions) {
  const beats = Number((xml.match(/<beats>(\d+)/i) || [])[1] || 2);
  const beatType = Number((xml.match(/<beat-type>(\d+)/i) || [])[1] || 4);
  if (!(beats > 0) || !(beatType > 0)) return divisions * 2;
  return Math.max(1, Math.round(divisions * beats * (4 / beatType)));
}

/**
 * OSMD crashes on measures with no voice timeline (common in OMR finales).
 * Replace them with a whole-measure rest.
 */
export function fillEmptyMeasures(xml, divisions = ENGRAVING_DIVISIONS) {
  const barDur = inferBarDuration(xml, divisions);
  return xml.replace(
    /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/gi,
    (full, attrs, body) => {
      if (voiceTimelineDuration(body) > 0) return full;
      if (/<pitch\b/i.test(body)) return full;
      const attributes = body.match(/<attributes>[\s\S]*?<\/attributes>/i)?.[0] || "";
      return `<measure${attrs}>${attributes}<note><rest measure="yes"/><duration>${barDur}</duration><voice>1</voice></note></measure>`;
    },
  );
}

function extractPartIds(xml) {
  const ids = [];
  const re = /<score-part\b[^>]*\bid\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(xml))) ids.push(m[1]);
  if (ids.length) return ids;
  const partRe = /<part\b[^>]*\bid\s*=\s*"([^"]+)"/gi;
  while ((m = partRe.exec(xml))) ids.push(m[1]);
  return [...new Set(ids)];
}

function extractPreamble(xml) {
  const match = xml.match(/^([\s\S]*?<part-list\b[\s\S]*?<\/part-list>)/i);
  if (!match) return null;
  return match[1].trimEnd();
}

function extractMeasuresForPart(xml, partId) {
  const partRe = new RegExp(
    `<part\\b[^>]*\\bid\\s*=\\s*"${escapeRegExp(partId)}"[^>]*>([\\s\\S]*?)</part>`,
    "i",
  );
  const partMatch = xml.match(partRe);
  if (!partMatch) return [];
  const body = partMatch[1];
  /** @type {string[]} */
  const measures = [];
  // Do not treat <measure-numbering> as a measure element.
  const measureRe = /<measure(?=[\s>])[\s\S]*?<\/measure>/gi;
  let m;
  while ((m = measureRe.exec(body))) {
    measures.push(m[0]);
  }
  return measures;
}

function setMeasureNumber(measureXml, number) {
  if (/<measure(?=[\s>])[^>]*\bnumber\s*=\s*"/i.test(measureXml)) {
    return measureXml.replace(
      /(<measure(?=[\s>])[^>]*\bnumber\s*=\s*")[^"]*(")/i,
      `$1${number}$2`,
    );
  }
  return measureXml.replace(/<measure(?=[\s>])/i, `<measure number="${number}"`);
}

/** Keep variation boundaries readable without implying end-of-piece mid-score. */
function softenFinalBarline(measureXml) {
  return measureXml.replace(
    /(<barline\b[^>]*location\s*=\s*"right"[^>]*>[\s\S]*?<bar-style>)light-heavy(<\/bar-style>)/i,
    "$1light-light$2",
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
