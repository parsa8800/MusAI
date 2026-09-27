/**
 * Phone photos are often ~1000px tall. Audiveris drops those pages when the
 * staff-line gap is only a few pixels ("too low interline"). Enlarge them
 * before recognition so a full page lands near a 300 DPI scan.
 */

import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { run } from "./rasterize.mjs";

/** Below this long side, staff lines are often too small to trust. */
const MIN_LONG_SIDE = 2400;
/** Long side after enlarge. 1024px → ~4000px, which Audiveris accepts. */
const TARGET_LONG_SIDE = 4000;
const MAX_FACTOR = 4;
/** Phone photos above this are slow and noisy (screen pixels, bezels). */
const MAX_LONG_SIDE = 3400;
/** Long side after shrinking a phone photo. Keeps staff gaps readable. */
const TARGET_DOWN_LONG_SIDE = 2800;

/**
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number } | null}
 */
export function sheetUpscaleSize(width, height) {
  if (!width || !height) return null;
  const longSide = Math.max(width, height);
  if (longSide >= MIN_LONG_SIDE) return null;
  const factor = Math.min(TARGET_LONG_SIDE / longSide, MAX_FACTOR);
  if (factor < 1.15) return null;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/**
 * iPhone photos store a portrait page sideways (EXIF 6). Audiveris ignores
 * that tag and only looks for horizontal staves, so the page has to be
 * turned before recognition. Huge frames are also shrunk so the grid step
 * finishes.
 *
 * @param {number} width Stored pixel width
 * @param {number} height Stored pixel height
 * @param {number} [orientation] EXIF orientation 1–8
 * @returns {{ orientation: number, width: number, height: number } | null}
 */
export function sheetPreparePlan(width, height, orientation = 1) {
  if (!width || !height) return null;
  const turn = orientation >= 2 && orientation <= 8 ? orientation : 1;
  const upright =
    turn >= 5
      ? { width: height, height: width }
      : { width, height };
  const fitted = fitLongSide(upright.width, upright.height);
  if (turn === 1 && !fitted) return null;
  return {
    orientation: turn,
    width: fitted?.width ?? upright.width,
    height: fitted?.height ?? upright.height,
  };
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number } | null}
 */
function fitLongSide(width, height) {
  const up = sheetUpscaleSize(width, height);
  if (up) return up;
  const longSide = Math.max(width, height);
  if (longSide <= MAX_LONG_SIDE) return null;
  const factor = TARGET_DOWN_LONG_SIDE / longSide;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/**
 * @param {Buffer} bytes
 * @returns {{ width: number, height: number } | null}
 */
export function readImageSize(bytes) {
  if (!bytes || bytes.length < 10) return null;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes.length >= 24
  ) {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) return null;
    const len = bytes.readUInt16BE(i + 2);
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3
    ) {
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
      };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/**
 * EXIF orientation. 1 means the pixels are already upright. iPhone portrait
 * photos are usually 6 (rotate 90° clockwise to view).
 * @param {Buffer} bytes
 * @returns {number}
 */
export function readJpegOrientation(bytes) {
  if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    const len = bytes.readUInt16BE(i + 2);
    if (len < 2) return 1;
    if (marker === 0xe1) {
      const start = i + 4;
      const end = i + 2 + len;
      if (
        end <= bytes.length &&
        bytes.toString("ascii", start, start + 4) === "Exif"
      ) {
        return orientationFromTiff(bytes.subarray(start + 6, end));
      }
    }
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return 1;
}

/**
 * @param {Buffer} tiff
 * @returns {number}
 */
function orientationFromTiff(tiff) {
  if (tiff.length < 16) return 1;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return 1;
  const u16 = (offset) =>
    le ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = (offset) =>
    le ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  if (u16(2) !== 0x2a) return 1;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let n = 0; n < count; n += 1) {
    const off = ifd + 2 + n * 12;
    if (off + 12 > tiff.length) break;
    if (u16(off) !== 0x0112) continue;
    const value = u16(off + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

/**
 * @param {number} orientation
 * @returns {string[]}
 */
export function sipsOrientArgs(orientation) {
  /** @type {string[]} */
  const args = [];
  if (orientation === 2 || orientation === 5 || orientation === 7) {
    args.push("-f", "horizontal");
  }
  if (orientation === 4) args.push("-f", "vertical");
  const turn = { 3: "180", 5: "270", 6: "90", 7: "90", 8: "270" }[orientation];
  if (turn) args.push("-r", turn);
  return args;
}

/**
 * @param {object} opts
 * @param {string} opts.inputPath
 * @param {string} opts.outDir
 * @returns {Promise<string | null>} Prepared JPEG, or null to keep the original
 */
export async function prepareSheetImageForOmr(opts) {
  const bytes = await readFile(opts.inputPath);
  const size = readImageSize(bytes);
  if (!size) return null;
  const plan = sheetPreparePlan(
    size.width,
    size.height,
    readJpegOrientation(bytes),
  );
  if (!plan) return null;

  const outPath = path.join(opts.outDir, "sheet-prepared.jpg");
  await writePrepared(opts.inputPath, outPath, plan);
  console.info(
    `[omr-worker] preparing sheet image exif=${plan.orientation} ${size.width}x${size.height} → ${plan.width}x${plan.height}`,
  );
  return outPath;
}

/**
 * @param {string} inputPath
 * @param {string} outPath
 * @param {{ orientation: number, width: number, height: number }} plan
 */
async function writePrepared(inputPath, outPath, plan) {
  try {
    await writePreparedWithSips(inputPath, outPath, plan);
    return;
  } catch (err) {
    const missing = err && err.code === "ENOENT";
    if (!missing) {
      // sips ran and failed — still try ImageMagick before giving up.
    }
  }
  const resize = `${plan.width}x${plan.height}!`;
  /** @type {Array<[string, string[]]>} */
  const attempts = [
    ["magick", [inputPath, "-auto-orient", "-resize", resize, outPath]],
    ["convert", [inputPath, "-auto-orient", "-resize", resize, outPath]],
  ];
  let last = new Error("No image resampler (sips, magick, or convert)");
  for (const [bin, args] of attempts) {
    try {
      await run(bin, args, { timeoutMs: 60_000 });
      return;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw last;
}

/**
 * Rotate first, then resize. sips applies every flag to the original pixels,
 * so a combined -r and -z would scale the sideways frame.
 * @param {string} inputPath
 * @param {string} outPath
 * @param {{ orientation: number, width: number, height: number }} plan
 */
async function writePreparedWithSips(inputPath, outPath, plan) {
  const orient = sipsOrientArgs(plan.orientation);
  const turned = orient.length ? `${outPath}.turn.jpg` : inputPath;
  if (orient.length) {
    await run("sips", [...orient, inputPath, "--out", turned], {
      timeoutMs: 60_000,
    });
  }
  try {
    await run(
      "sips",
      ["-z", String(plan.height), String(plan.width), turned, "--out", outPath],
      { timeoutMs: 60_000 },
    );
  } finally {
    if (turned !== inputPath) {
      await rm(turned, { force: true });
    }
  }
}
