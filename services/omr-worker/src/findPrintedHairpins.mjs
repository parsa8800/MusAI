/**
 * Hairpins are two ink lines that open or close. The score reader often
 * keeps the crescendo and drops the decrescendo. The page image still has
 * both, in the same pixel space as the reader's staves, so the missing
 * hairpin can be measured from the ink.
 */

import { inflateSync } from "node:zlib";

/**
 * @param {Uint8Array} pngBytes
 * @param {string} sheetXml
 * @returns {{ type: "crescendo" | "diminuendo", x: number, y: number, w: number, h: number }[]}
 */
export function findPrintedHairpins(pngBytes, sheetXml) {
  const image = decodeGrayPng(pngBytes);
  if (!image || !sheetXml) return [];
  return hairpinsInGrayImage(image, sheetXml);
}

/**
 * @param {{ width: number, height: number, rows: Uint8Array[] }} image
 * @param {string} sheetXml
 */
export function hairpinsInGrayImage(image, sheetXml) {
  const interline = parseInterline(sheetXml);
  const systems = parseSystems(sheetXml);
  /** @type {{ type: "crescendo" | "diminuendo", x: number, y: number, w: number, h: number }[]} */
  const found = [];
  systems.forEach((system, index) => {
    const next = systems[index + 1];
    const y0 = system.bottom + interline * 0.7;
    const y1 = next
      ? Math.min(next.top - interline * 0.25, system.bottom + interline * 8.5)
      : system.bottom + interline * 8.5;
    for (const hairpin of scanBand(image, y0, y1, interline)) {
      found.push(hairpin);
    }
  });
  return found;
}

/**
 * @param {Uint8Array} png
 * @returns {{ width: number, height: number, rows: Uint8Array[] } | null}
 */
export function decodeGrayPng(png) {
  if (!png || png.length < 24) return null;
  if (png[0] !== 0x89 || png[1] !== 0x50) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const color = png[25];
  const bpp = color === 2 ? 3 : color === 6 ? 4 : color === 0 ? 1 : 0;
  if (!bpp || width < 8 || height < 8) return null;

  /** @type {Uint8Array[]} */
  const idat = [];
  let pos = 8;
  while (pos + 8 <= png.length) {
    const size = view.getUint32(pos);
    pos += 4;
    const type = String.fromCharCode(
      png[pos],
      png[pos + 1],
      png[pos + 2],
      png[pos + 3],
    );
    pos += 4;
    if (type === "IDAT") idat.push(png.subarray(pos, pos + size));
    pos += size + 4;
    if (type === "IEND") break;
  }
  if (idat.length === 0) return null;

  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat.map((chunk) => Buffer.from(chunk))));
  } catch {
    return null;
  }

  const stride = width * bpp;
  /** @type {Uint8Array[]} */
  const rows = [];
  let offset = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    if (offset + 1 + stride > raw.length) return null;
    const filter = raw[offset];
    offset += 1;
    const row = raw.subarray(offset, offset + stride);
    offset += stride;
    const out = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? out[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let value = row[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      out[x] = value & 255;
    }
    const gray = new Uint8Array(width);
    for (let x = 0; x < width; x++) gray[x] = out[x * bpp];
    rows.push(gray);
    prev = out;
  }
  return { width, height, rows };
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dul) return left;
  return du <= dul ? up : upLeft;
}

function parseInterline(sheet) {
  const match = String(sheet).match(/<interline\b[^>]*\bmain="([0-9.]+)"/i);
  const value = match ? Number(match[1]) : 30;
  return Number.isFinite(value) && value > 0 ? value : 30;
}

function parseSystems(sheet) {
  /** @type {{ top: number, bottom: number }[]} */
  const systems = [];
  const re = /<system\b[^>]*>([\s\S]*?)<\/system>/gi;
  let match;
  while ((match = re.exec(sheet))) {
    const lines = match[1].match(/<lines>([\s\S]*?)<\/lines>/i);
    const ys = lines
      ? [...lines[1].matchAll(/\by="([0-9.]+)"/g)].map((point) => Number(point[1]))
      : [];
    if (ys.length === 0) continue;
    systems.push({ top: Math.min(...ys), bottom: Math.max(...ys) });
  }
  return systems;
}

/**
 * @param {{ width: number, height: number, rows: Uint8Array[] }} image
 */
function scanBand(image, y0, y1, interline) {
  const top = Math.max(0, Math.floor(y0));
  const bottom = Math.min(image.height - 1, Math.floor(y1));
  if (bottom - top < interline) return [];

  /** @type {{ y: number, h: number }[][]} */
  const columns = [];
  for (let x = 0; x < image.width; x++) {
    /** @type {number[]} */
    const ys = [];
    const rowSpan = image.rows;
    for (let y = top; y <= bottom; y++) {
      if (rowSpan[y][x] < 90) ys.push(y);
    }
    columns.push(
      clusters(ys, Math.max(2, interline * 0.22))
        .filter((cluster) => cluster.h <= interline * 0.85)
        .sort((a, b) => a.y - b.y),
    );
  }

  /** @type {{ type: "crescendo" | "diminuendo", x: number, y: number, w: number, h: number }[]} */
  const found = [];
  /** @type {{ samples: { x: number, top: number, bot: number }[], tipEnd: number } | null} */
  let run = null;
  let blank = 0;
  const gapLimit = interline * 2.2;

  const finish = () => {
    if (!run) return;
    const samples = run.samples;
    const x0 = samples[0]?.x ?? 0;
    const x1 = Math.max(samples.at(-1)?.x ?? 0, run.tipEnd ?? 0);
    if (samples.length >= interline * 4 && x1 - x0 > interline * 6) {
      const gaps = samples.map((sample) => sample.bot - sample.top);
      const left = average(gaps.slice(0, Math.max(1, Math.floor(gaps.length * 0.18))));
      const right = average(gaps.slice(Math.floor(gaps.length * 0.82)));
      const type =
        left > right + interline * 0.4
          ? "diminuendo"
          : right > left + interline * 0.4
            ? "crescendo"
            : null;
      if (type && Math.max(left, right) > interline * 0.8) {
        const y = Math.min(...samples.map((sample) => sample.top));
        const bot = Math.max(...samples.map((sample) => sample.bot));
        found.push({
          type,
          x: Math.round(x0),
          y: Math.round(y),
          w: Math.round(x1 - x0),
          h: Math.max(1, Math.round(bot - y)),
        });
      }
    }
    run = null;
    blank = 0;
  };

  for (let x = 0; x < columns.length; x++) {
    const clustersHere = columns[x];
    /** @type {{ x: number, top: number, bot: number } | null} */
    let sample = null;
    if (clustersHere.length >= 2) {
      const lineTop = clustersHere[0];
      const lineBot = clustersHere[clustersHere.length - 1];
      const gap = lineBot.y - lineTop.y;
      if (gap >= interline * 0.3 && gap <= interline * 4.2) {
        sample = { x, top: lineTop.y, bot: lineBot.y };
      }
    }
    if (sample) {
      if (!run) run = { samples: [], tipEnd: x };
      run.samples.push(sample);
      run.tipEnd = x;
      blank = 0;
      continue;
    }
    if (!run) continue;
    const single =
      clustersHere.length === 1 && clustersHere[0].h <= interline * 0.7;
    if (single) {
      run.tipEnd = x;
      blank = 0;
      continue;
    }
    blank += 1;
    if (blank > gapLimit) finish();
  }
  finish();
  return found;
}

function clusters(ys, gap) {
  if (ys.length === 0) return [];
  /** @type {number[][]} */
  const groups = [[ys[0]]];
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] > gap) groups.push([ys[i]]);
    else groups[groups.length - 1].push(ys[i]);
  }
  return groups.map((group) => ({
    y: (group[0] + group[group.length - 1]) / 2,
    h: group[group.length - 1] - group[0] + 1,
  }));
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
