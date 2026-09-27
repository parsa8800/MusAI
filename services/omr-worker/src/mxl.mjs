/**
 * Minimal ZIP reader for MusicXML .mxl (store + deflate).
 * Parses the central directory so Audiveris exports that use ZIP data
 * descriptors (compSize=0 in the local header) still decode.
 * Keeps the worker free of npm deps beyond Node builtins.
 */

import { inflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * @param {Uint8Array} data
 * @returns {Record<string, Uint8Array>}
 */
export function unzipSync(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEocd(view, data.length);
  if (eocd != null) {
    return unzipViaCentralDirectory(data, view, eocd);
  }
  return unzipViaLocalHeaders(data, view);
}

/**
 * @param {DataView} view
 * @param {number} length
 * @returns {number | null} EOCD offset
 */
function findEocd(view, length) {
  // EOCD is at the end; comment can be up to 64KiB.
  const min = Math.max(0, length - 22 - 0xffff);
  for (let i = length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i;
  }
  return null;
}

/**
 * @param {Uint8Array} data
 * @param {DataView} view
 * @param {number} eocdOffset
 */
function unzipViaCentralDirectory(data, view, eocdOffset) {
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  /** @type {Record<string, Uint8Array>} */
  const out = {};
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (p + 46 <= cdEnd && view.getUint32(p, true) === SIG_CENTRAL) {
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const uncompSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeader = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(
      data.subarray(p + 46, p + 46 + nameLen),
    );
    if (!name.endsWith("/")) {
      out[name] = inflateEntry(
        data,
        view,
        localHeader,
        method,
        compSize,
        uncompSize,
      );
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * Fallback when no EOCD is present (rare for .mxl).
 * @param {Uint8Array} data
 * @param {DataView} view
 */
function unzipViaLocalHeaders(data, view) {
  /** @type {Record<string, Uint8Array>} */
  const out = {};
  let offset = 0;
  while (offset + 30 <= data.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== SIG_LOCAL) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    let compSize = view.getUint32(offset + 18, true);
    let uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(
      data.subarray(nameStart, nameStart + nameLen),
    );
    const dataStart = nameStart + nameLen + extraLen;
    if (flags & 0x8) {
      // Data descriptor — sizes unavailable without scanning; skip this path.
      throw new Error(
        `ZIP data descriptor for ${name} requires a central directory`,
      );
    }
    const compressed = data.subarray(dataStart, dataStart + compSize);
    if (!name.endsWith("/")) {
      out[name] = inflateBytes(compressed, method, uncompSize, name);
    }
    offset = dataStart + compSize;
  }
  return out;
}

/**
 * @param {Uint8Array} data
 * @param {DataView} view
 * @param {number} localHeader
 * @param {number} method
 * @param {number} compSize
 * @param {number} uncompSize
 */
function inflateEntry(data, view, localHeader, method, compSize, uncompSize) {
  if (view.getUint32(localHeader, true) !== SIG_LOCAL) {
    throw new Error("Invalid ZIP local header");
  }
  const nameLen = view.getUint16(localHeader + 26, true);
  const extraLen = view.getUint16(localHeader + 28, true);
  const dataStart = localHeader + 30 + nameLen + extraLen;
  const compressed = data.subarray(dataStart, dataStart + compSize);
  const name = new TextDecoder().decode(
    data.subarray(localHeader + 30, localHeader + 30 + nameLen),
  );
  return inflateBytes(compressed, method, uncompSize, name);
}

/**
 * @param {Uint8Array} compressed
 * @param {number} method
 * @param {number} uncompSize
 * @param {string} name
 */
function inflateBytes(compressed, method, uncompSize, name) {
  if (method === 0) {
    return compressed.slice(0, uncompSize || compressed.length);
  }
  if (method === 8) {
    return new Uint8Array(inflateRawSync(compressed));
  }
  throw new Error(`Unsupported ZIP method ${method} for ${name}`);
}

/** @param {Uint8Array} bytes */
export function strFromU8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

/** @deprecated kept for audiveris.mjs import compatibility */
export function inflateSync(bytes) {
  return inflateRawSync(bytes);
}
