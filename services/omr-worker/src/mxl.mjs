/**
 * Minimal ZIP reader for MusicXML .mxl (store + deflate).
 * Keeps the worker free of npm deps beyond Node builtins.
 */

import { inflateRawSync } from "node:zlib";

/**
 * @param {Uint8Array} data
 * @returns {Record<string, Uint8Array>}
 */
export function unzipSync(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  /** @type {Record<string, Uint8Array>} */
  const out = {};
  let offset = 0;
  while (offset + 4 <= data.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // local file header
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(
      data.subarray(nameStart, nameStart + nameLen),
    );
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = data.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      out[name] = compressed.slice(0, uncompSize);
    } else if (method === 8) {
      out[name] = new Uint8Array(inflateRawSync(compressed));
    } else {
      throw new Error(`Unsupported ZIP method ${method} for ${name}`);
    }
    offset = dataStart + compSize;
  }
  return out;
}

/** @param {Uint8Array} bytes */
export function strFromU8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

/** @deprecated kept for audiveris.mjs import compatibility */
export function inflateSync(bytes) {
  return inflateRawSync(bytes);
}
