/**
 * Run: node --test services/omr-worker/src/mxl.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { unzipSync, strFromU8 } from "./mxl.mjs";

test("unzips Audiveris-like .mxl that uses ZIP data descriptors", () => {
  const buf = Buffer.from(buildDataDescriptorZip());
  const files = unzipSync(new Uint8Array(buf));
  assert.deepEqual(Object.keys(files).sort(), ["piece.xml"]);
  const text = strFromU8(files["piece.xml"]);
  assert.match(text, /score-partwise/);
  assert.match(text, /<step>C<\/step>/);
});

test("unzips store-method ZIP via local headers", () => {
  const payload = Buffer.from(
    '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>',
  );
  const name = Buffer.from("score.xml");
  const local = Buffer.alloc(30 + name.length + payload.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(0, 8); // store
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  payload.copy(local, 30 + name.length);
  // Minimal EOCD pointing at empty CD → falls back? We need CD for robustness.
  // Without EOCD, local-header path works for store with sizes set.
  const files = unzipSync(new Uint8Array(local));
  assert.equal(
    strFromU8(files["score.xml"]),
    payload.toString("utf8"),
  );
});

/** Build a deflate ZIP with data descriptors + central directory (Audiveris-like). */
function buildDataDescriptorZip() {
  const xml = Buffer.from(
    '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>',
  );
  const compressed = deflateRawSync(xml);
  const name = Buffer.from("piece.xml");
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(0x08, 6); // data descriptor flag
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(0, 18);
  local.writeUInt32LE(0, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);

  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(0, 4); // crc
  descriptor.writeUInt32LE(compressed.length, 8);
  descriptor.writeUInt32LE(xml.length, 12);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // local header offset
  name.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(
    local.length + compressed.length + descriptor.length,
    16,
  );

  return Buffer.concat([local, compressed, descriptor, central, eocd]);
}
