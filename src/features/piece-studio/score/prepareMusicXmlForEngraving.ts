/**
 * Make Audiveris multi-movement merges safe for OpenSheetMusicDisplay
 * without rewriting the recognized pitches.
 *
 * Layout-only: shared divisions, drop print/staff-details, fill truly empty
 * bars, strip illegal beams. Keep keys, times, clefs, tuplets, and chords.
 * Mirror of `services/omr-worker/src/mergePartwiseMusicXml.mjs`.
 */

const ENGRAVING_DIVISIONS = 24;

export function prepareMusicXmlForEngraving(xml: string): string {
  if (!xml || !/<score-partwise\b/i.test(xml)) return xml;
  let out = stripDoctype(xml);
  out = normalizeDivisions(out, ENGRAVING_DIVISIONS);
  out = stripPrintBlocks(out);
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

function stripDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE[^>]*>/i, "");
}

function stripPrintBlocks(xml: string): string {
  return xml.replace(/<print\b[\s\S]*?<\/print>/gi, "");
}

function stripLeftBarlines(xml: string): string {
  return xml.replace(
    /<barline\b[^>]*location\s*=\s*"left"[^>]*>[\s\S]*?<\/barline>/gi,
    "",
  );
}

function stripStaffDetails(xml: string): string {
  return xml
    .replace(/<staff-details\b[^>]*\/>/gi, "")
    .replace(/<staff-details\b[\s\S]*?<\/staff-details>/gi, "");
}

/**
 * Unmatched 8va pairs crash OSMD getStave after a merge. Drop only the
 * leftover start/stop, not a balanced shift (that would move notes an octave).
 */
export function closeUnmatchedOctaveShifts(xml: string): string {
  const starts = (xml.match(/<octave-shift\b[^>]*type="(?:up|down)"/gi) || [])
    .length;
  const stops = (xml.match(/<octave-shift\b[^>]*type="stop"/gi) || []).length;
  if (starts === stops) return xml;
  return xml.replace(/<direction\b[\s\S]*?<\/direction>/gi, (block) =>
    /<octave-shift\b/i.test(block) ? "" : block,
  );
}

/**
 * First attributes keep divisions + key/time/clef. Later blocks keep only
 * key/time/clef when they actually change — drop duplicate divisions that
 * crash OSMD after a multi-movement merge.
 */
export function keepMusicalAttributes(xml: string): string {
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
    const parts: string[] = [];
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

/**
 * Display-only grace cleanup: short type + slash. Do not turn a following
 * chord head into a new sequential note.
 */
export function sanitizeGraceNotes(xml: string): string {
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

/** @deprecated Use sanitizeGraceNotes — kept so existing tests can migrate. */
export function normalizeGraceNotes(xml: string): string {
  return sanitizeGraceNotes(xml);
}

/**
 * Drop orphaned tuplet start/stop (often unmatched after OMR). Keep
 * `<time-modification>` so the written rhythm is unchanged.
 */
export function repairTupletMarkers(xml: string): string {
  return xml
    .replace(/<tuplet\b[^>]*\/>/gi, "")
    .replace(/<tuplet\b[\s\S]*?<\/tuplet>/gi, "")
    .replace(/<notations>\s*<\/notations>/gi, "");
}

/** @deprecated Use repairTupletMarkers. */
export function stripTupletMarkers(xml: string): string {
  return repairTupletMarkers(xml);
}

/**
 * VexFlow rejects beams on quarter-or-longer notes. Chord notes should not
 * carry their own beam tags either (Audiveris duplicates them per head).
 */
export function fixIllegalBeams(xml: string): string {
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

export function normalizeDivisions(
  xml: string,
  target = ENGRAVING_DIVISIONS,
): string {
  let cur: number | null = null;
  return xml.replace(
    /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/gi,
    (_full, attrs: string, body: string) => {
      const divMatch = body.match(/<divisions>(\d+)<\/divisions>/i);
      if (divMatch) cur = Number(divMatch[1]);
      if (cur == null || !(cur > 0)) cur = target;
      const scale = target / cur;
      let next = body.replace(
        /<divisions>\d+<\/divisions>/gi,
        `<divisions>${target}</divisions>`,
      );
      next = next.replace(/<duration>(\d+)<\/duration>/gi, (_d, n: string) => {
        const scaled = Math.max(1, Math.round(Number(n) * scale));
        return `<duration>${scaled}</duration>`;
      });
      return `<measure${attrs}>${next}</measure>`;
    },
  );
}

function voiceTimelineDuration(measureBody: string): number {
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

function inferBarDuration(xml: string, divisions: number): number {
  const beats = Number((xml.match(/<beats>(\d+)/i) || [])[1] || 2);
  const beatType = Number((xml.match(/<beat-type>(\d+)/i) || [])[1] || 4);
  if (!(beats > 0) || !(beatType > 0)) return divisions * 2;
  return Math.max(1, Math.round(divisions * beats * (4 / beatType)));
}

export function fillEmptyMeasures(
  xml: string,
  divisions = ENGRAVING_DIVISIONS,
): string {
  const barDur = inferBarDuration(xml, divisions);
  return xml.replace(
    /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure>/gi,
    (full, attrs: string, body: string) => {
      if (voiceTimelineDuration(body) > 0) return full;
      if (/<pitch\b/i.test(body)) return full;
      const attributes =
        body.match(/<attributes>[\s\S]*?<\/attributes>/i)?.[0] || "";
      return `<measure${attrs}>${attributes}<note><rest measure="yes"/><duration>${barDur}</duration><voice>1</voice></note></measure>`;
    },
  );
}
