/**
 * Audiveris often sees the printed dynamics and hairpins, then leaves a
 * hairpin out of the score when it is not tied to a note, and writes ff as
 * two separate f marks. The book file still has the glyphs. A hairpin the
 * reader missed is measured from the page image. Each hairpin stays in the
 * bars its ink actually covers, and stops at the barline instead of running
 * into the next bar's dynamic.
 */

import { findPrintedHairpins } from "./findPrintedHairpins.mjs";

const MIN_DYNAMIC_GRADE = 0.35;
const MIN_WEDGE_GRADE = 0.5;

const DYNAMIC_TOKEN = {
  DYNAMICS_P: "p",
  DYNAMICS_PP: "pp",
  DYNAMICS_PPP: "ppp",
  DYNAMICS_F: "f",
  DYNAMICS_FF: "ff",
  DYNAMICS_FFF: "fff",
  DYNAMICS_MP: "mp",
  DYNAMICS_MF: "mf",
  DYNAMICS_SF: "sf",
  DYNAMICS_SFZ: "sfz",
  DYNAMICS_FP: "fp",
  DYNAMICS_FZ: "fz",
};

/**
 * @param {string} musicXml
 * @param {string[]} sheetXmls Audiveris sheet XML, in page order
 * @param {(Uint8Array | null | undefined)[]} [pagePngs] Page image aligned with each sheet
 * @returns {string}
 */
export function recoverPrintedDynamics(musicXml, sheetXmls, pagePngs) {
  /** @type {{ sheet: string, png: Uint8Array | null }[]} */
  const pages = [];
  (sheetXmls || []).forEach((sheet, index) => {
    if (typeof sheet === "string" && sheet.includes("<stack ")) {
      const png = pagePngs?.[index];
      pages.push({ sheet, png: png instanceof Uint8Array ? png : null });
    }
  });
  if (!musicXml || pages.length === 0) return musicXml;
  return rebuild(musicXml, pages);
}

/**
 * @param {string} musicXml
 * @param {{ sheet: string, png: Uint8Array | null }[]} pages
 */
function rebuild(musicXml, pages) {
  /** @type {Map<number, { items: { fraction: number, xml: string, kind: string, order: number }[] }>} */
  const byMeasure = new Map();
  let order = 0;
  const bucket = (measure) => {
    let row = byMeasure.get(measure);
    if (!row) {
      row = { items: [] };
      byMeasure.set(measure, row);
    }
    return row;
  };
  const add = (measure, fraction, xml, kind) => {
    bucket(measure).items.push({
      fraction,
      xml,
      kind,
      order: order++,
    });
  };

  for (const page of pages) {
    const sheet = page.sheet;
    const systems = parseSystems(sheet);
    const interline = parseInterline(sheet);
    /** @type {number[]} */
    const systemMeasureBase = [];
    let measureBase = 0;
    for (const system of systems) {
      systemMeasureBase.push(measureBase);
      measureBase += system.stacks.length;
    }

    const placeX = (systemIndex, x) => {
      const system = systems[systemIndex];
      const base = systemMeasureBase[systemIndex] ?? 0;
      const stacks = system?.stacks || [];
      for (let i = 0; i < stacks.length; i++) {
        const stack = stacks[i];
        if (x >= stack.left && x < stack.right) return base + i + 1;
      }
      if (stacks.length === 0) return base + 1;
      if (x < stacks[0].left) return base + 1;
      return base + stacks.length;
    };

    const marks = mergeSideBySide(parseDynamics(sheet));
    for (const mark of marks) {
      const systemIndex = nearestSystem(systems, mark.y + mark.h / 2);
      const measure = placeX(systemIndex, mark.x + mark.w / 2);
      add(measure, 0, dynamicDirection(mark.token), "dynamic");
    }

    let wedgeNumber = 1;
    for (const wedge of collectWedges(sheet, page.png, marks, interline)) {
      const systemIndex = nearestSystem(systems, wedge.y + wedge.h / 2);
      const stacks = systems[systemIndex]?.stacks || [];
      const startX = wedge.x + Math.min(8, wedge.w * 0.05);
      const right = wedge.x + wedge.w;
      let start = placeX(systemIndex, startX);
      let end = placeX(systemIndex, Math.max(startX, right - 1));
      let startFrac = fractionInStacks(stacks, startX);
      let endFrac = fractionInStacks(stacks, Math.max(startX, right - 1));
      // A hairpin that only nicks the next barline still belongs to the bar
      // it was printed in. The arrival dynamic (ff, p, …) stays on its own note.
      if (end === start + 1 && endFrac < 0.12) {
        end = start;
        endFrac = 0.98;
      }
      if (end < start) {
        end = start;
        endFrac = Math.max(endFrac, startFrac);
      }
      const number = wedgeNumber++;
      add(start, startFrac, wedgeDirection(wedge.type, number), "start");
      add(end, end === start ? Math.max(endFrac, startFrac) : endFrac, wedgeDirection("stop", number), "stop");
    }
  }

  const sheetHasGlyphs = pages.some((page) =>
    /<dynamics\b|<wedge\b/i.test(page.sheet),
  );
  if (!sheetHasGlyphs && byMeasure.size === 0) return musicXml;

  const stripped = musicXml.replace(
    /<direction\b[\s\S]*?<\/direction>/gi,
    (block) => (/<dynamics\b|<wedge\b/i.test(block) ? "" : block),
  );
  if (byMeasure.size === 0) return stripped;

  const used = new Set();
  return stripped.replace(
    /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure(?![A-Za-z0-9_-])/gi,
    (full, attrs, body) => {
      const num = Number((String(attrs).match(/\bnumber="(\d+)"/) || [])[1]);
      if (!Number.isFinite(num)) return full;
      if (used.has(num)) return full;
      used.add(num);
      const extra = byMeasure.get(num);
      if (!extra || extra.items.length === 0) return full;
      return `<measure${attrs}>${placeMarks(body, extra.items)}</measure>`;
    },
  );
}

function dynamicDirection(token) {
  return `<direction placement="below"><direction-type><dynamics><${token}/></dynamics></direction-type></direction>`;
}

function wedgeDirection(type, number) {
  return `<direction placement="below"><direction-type><wedge type="${type}" number="${number}"/></direction-type></direction>`;
}

/**
 * Reader wedges win when they overlap an ink wedge. Ink wedges fill the
 * hairpins the reader never grouped, and they stop before a dynamic they
 * would otherwise run through.
 * @param {string} sheet
 * @param {Uint8Array | null} png
 * @param {{ x: number, y: number, w: number, h: number }[]} marks
 * @param {number} interline
 */
function collectWedges(sheet, png, marks, interline) {
  const fromReader = parseWedges(sheet).map((wedge) =>
    clipBeforeDynamic(wedge, marks, interline),
  );
  if (!png) return fromReader;
  const fromInk = findPrintedHairpins(png, sheet)
    .map((wedge) => clipBeforeDynamic(wedge, marks, interline))
    .filter(
      (wedge) => !fromReader.some((known) => wedgesOverlap(known, wedge)),
    );
  return [...fromReader, ...fromInk];
}

function clipBeforeDynamic(wedge, marks, interline) {
  let right = wedge.x + wedge.w;
  for (const mark of marks) {
    if (Math.abs(mark.y - wedge.y) > interline * 5) continue;
    if (mark.x > wedge.x + wedge.w * 0.45 && mark.x < right + mark.w) {
      right = Math.min(right, mark.x - interline * 0.25);
    }
  }
  if (!(right > wedge.x + interline * 4)) return wedge;
  return { ...wedge, w: right - wedge.x };
}

function wedgesOverlap(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  if (right - left <= 0) return false;
  if (Math.abs(a.y - b.y) > Math.max(a.h, b.h, 40) * 3) return false;
  return (right - left) / Math.min(a.w, b.w) > 0.35;
}

function fractionInStacks(stacks, x) {
  for (const stack of stacks) {
    const width = stack.right - stack.left;
    if (width <= 0) continue;
    if (x >= stack.left && x < stack.right) {
      return Math.min(0.98, Math.max(0, (x - stack.left) / width));
    }
  }
  return x > (stacks.at(-1)?.right ?? 0) ? 0.98 : 0;
}

/**
 * @param {string} body
 * @param {{ fraction: number, xml: string, kind: string, order: number }[]} items
 */
function placeMarks(body, items) {
  const timeline = measureTimeline(body);
  const inserts = [...items]
    .sort((a, b) => a.fraction - b.fraction || a.order - b.order)
    .map((item) => ({
      index: indexForMark(timeline, item),
      xml: item.xml,
      order: item.order,
    }));
  inserts.sort((a, b) => b.index - a.index || b.order - a.order);
  let next = body;
  for (const insert of inserts) {
    next = next.slice(0, insert.index) + insert.xml + next.slice(insert.index);
  }
  return next;
}

function measureTimeline(body) {
  const notes = [...String(body).matchAll(/<note\b[\s\S]*?<\/note>/gi)];
  let time = 0;
  /** @type {{ index: number, time: number }[]} */
  const events = [];
  for (const note of notes) {
    if (/<chord\s*\/>/i.test(note[0]) || /<grace\b/i.test(note[0])) continue;
    events.push({ index: note.index ?? 0, time });
    const duration = Number((note[0].match(/<duration>(\d+)/i) || [])[1] || 0);
    time += duration;
  }
  const attributes = body.match(/<\/attributes>/i);
  const contentStart = attributes
    ? (attributes.index ?? 0) + attributes[0].length
    : 0;
  const barline = body.search(/<barline\b/i);
  return {
    events,
    total: time || 1,
    contentStart,
    contentEnd: barline >= 0 ? barline : body.length,
  };
}

function indexForMark(timeline, item) {
  const { events, total, contentStart, contentEnd } = timeline;
  if (item.kind === "stop" && item.fraction >= 0.88) return contentEnd;
  if (item.kind !== "stop" && item.fraction <= 0.1) return contentStart;
  const target = item.fraction * total;
  if (item.kind === "stop") {
    const next = events.find((event) => event.time > target + total * 0.02);
    return next ? next.index : contentEnd;
  }
  let chosen = null;
  for (const event of events) {
    if (event.time <= target + 0.001) chosen = event;
  }
  return chosen ? chosen.index : contentStart;
}

function glyphGrade(attrs) {
  const match = String(attrs).match(/(?:^|\s)grade="([0-9.]+)"/i);
  const value = match ? Number(match[1]) : 0;
  return Number.isFinite(value) ? value : 0;
}

function parseInterline(sheet) {
  const match = sheet.match(/<interline\b[^>]*\bmain="([0-9.]+)"/i);
  const value = match ? Number(match[1]) : 30;
  return Number.isFinite(value) && value > 0 ? value : 30;
}

/**
 * Each printed line is a system. Bar positions start over on the next line,
 * so a mark is placed on the nearest staff, then on the bar at that x.
 * @param {string} sheet
 * @returns {{ stacks: { left: number, right: number }[], top: number | null, bottom: number | null }[]}
 */
function parseSystems(sheet) {
  /** @type {ReturnType<typeof systemFrom>[]} */
  const systems = [];
  const re = /<system\b[^>]*>([\s\S]*?)<\/system>/gi;
  let match;
  while ((match = re.exec(sheet))) systems.push(systemFrom(match[1]));
  if (systems.length === 0) systems.push(systemFrom(sheet));
  return systems;
}

function systemFrom(body) {
  const ys = [];
  const linesRe = /<lines>([\s\S]*?)<\/lines>/gi;
  let line;
  while ((line = linesRe.exec(body))) {
    for (const point of line[1].matchAll(/\by="([0-9.]+)"/g)) {
      ys.push(Number(point[1]));
    }
  }
  return {
    stacks: parseStacks(body),
    top: ys.length ? Math.min(...ys) : null,
    bottom: ys.length ? Math.max(...ys) : null,
  };
}

function nearestSystem(systems, y) {
  let best = 0;
  let bestDist = Infinity;
  systems.forEach((system, index) => {
    const dist = verticalDistance(system, y);
    if (dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  });
  return best;
}

function verticalDistance(system, y) {
  if (system.top == null || system.bottom == null || !Number.isFinite(y)) return 0;
  if (y < system.top) return system.top - y;
  if (y > system.bottom) return y - system.bottom;
  return 0;
}

function parseStacks(sheet) {
  /** @type {{ left: number, right: number }[]} */
  const stacks = [];
  const re = /<stack\b[^>]*\bleft="([0-9.]+)"[^>]*\bright="([0-9.]+)"/gi;
  let match;
  while ((match = re.exec(sheet))) {
    stacks.push({ left: Number(match[1]), right: Number(match[2]) });
  }
  return stacks;
}

function parseDynamics(sheet) {
  /** @type {{ token: string, x: number, y: number, w: number, h: number }[]} */
  const marks = [];
  const re = /<dynamics\b([^>]*)>([\s\S]*?)<\/dynamics>/gi;
  let match;
  while ((match = re.exec(sheet))) {
    const attrs = match[1];
    const body = match[2];
    const shape = attrs.match(/\bshape="([^"]+)"/i)?.[1] || "";
    const token = DYNAMIC_TOKEN[shape];
    if (!token) continue;
    const grade = glyphGrade(attrs);
    if (!(grade >= MIN_DYNAMIC_GRADE)) continue;
    const bounds = body.match(
      /<bounds\b[^>]*\bx="([0-9.]+)"[^>]*\by="([0-9.]+)"[^>]*\bw="([0-9.]+)"[^>]*\bh="([0-9.]+)"/i,
    );
    if (!bounds) continue;
    marks.push({
      token,
      x: Number(bounds[1]),
      y: Number(bounds[2]),
      w: Number(bounds[3]),
      h: Number(bounds[4]),
    });
  }
  return marks;
}

function parseWedges(sheet) {
  /** @type {{ type: "crescendo" | "diminuendo", x: number, y: number, w: number, h: number }[]} */
  const wedges = [];
  const re = /<wedge\b([^>]*)>([\s\S]*?)<\/wedge>/gi;
  let match;
  while ((match = re.exec(sheet))) {
    const attrs = match[1];
    const body = match[2];
    const shape = (attrs.match(/\bshape="([^"]+)"/i)?.[1] || "").toUpperCase();
    const type =
      shape === "CRESCENDO"
        ? "crescendo"
        : shape === "DIMINUENDO"
          ? "diminuendo"
          : null;
    if (!type) continue;
    const grade = glyphGrade(attrs);
    if (!(grade >= MIN_WEDGE_GRADE)) continue;
    const bounds = body.match(
      /<bounds\b[^>]*\bx="([0-9.]+)"[^>]*\by="([0-9.]+)"[^>]*\bw="([0-9.]+)"[^>]*\bh="([0-9.]+)"/i,
    );
    if (!bounds) continue;
    wedges.push({
      type,
      x: Number(bounds[1]),
      y: Number(bounds[2]),
      w: Number(bounds[3]),
      h: Number(bounds[4]),
    });
  }
  return wedges;
}

/**
 * ff and pp are often two touching letters. Overlapping f+f becomes ff.
 * @param {{ token: string, x: number, y: number, w: number, h: number }[]} marks
 */
function dynamicLetter(token) {
  if (typeof token !== "string" || token.length === 0) return null;
  const letter = token[0];
  if ((letter === "p" || letter === "f") && [...token].every((ch) => ch === letter)) {
    return letter;
  }
  return null;
}

function mergeSideBySide(marks) {
  let current = [...marks].sort((a, b) => a.x - b.x || a.y - b.y);
  let changed = true;
  while (changed) {
    changed = false;
    /** @type {typeof current} */
    const merged = [];
    for (let i = 0; i < current.length; i++) {
      const mark = current[i];
      const next = current[i + 1];
      const letter = dynamicLetter(mark.token);
      if (
        next &&
        letter &&
        letter === dynamicLetter(next.token) &&
        mark.token.length + next.token.length <= 3 &&
        Math.abs(mark.y - next.y) < 50 &&
        next.x - (mark.x + mark.w) < Math.max(mark.w, next.w) * 0.8
      ) {
        merged.push({
          ...mark,
          token: letter.repeat(mark.token.length + next.token.length),
          w: next.x + next.w - mark.x,
        });
        changed = true;
        i += 1;
        continue;
      }
      merged.push(mark);
    }
    current = merged;
  }
  return current;
}
