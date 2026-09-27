/**
 * Run: node --test services/omr-worker/src/prepareSheetImage.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  readImageSize,
  readJpegOrientation,
  sheetPreparePlan,
  sheetUpscaleSize,
  sipsOrientArgs,
} from "./prepareSheetImage.mjs";

test("enlarges a phone photo so staff lines are readable", () => {
  const next = sheetUpscaleSize(768, 1024);
  assert.ok(next);
  assert.equal(next.height, 4000);
  assert.equal(next.width, 3000);
});

test("leaves a page that is already a good size alone", () => {
  assert.equal(sheetUpscaleSize(2200, 3000), null);
  assert.equal(sheetPreparePlan(2200, 3000, 1), null);
});

test("turns an iPhone portrait photo upright and shrinks it", () => {
  const plan = sheetPreparePlan(4032, 3024, 6);
  assert.ok(plan);
  assert.equal(plan.orientation, 6);
  assert.equal(plan.width, 2100);
  assert.equal(plan.height, 2800);
  assert.deepEqual(sipsOrientArgs(6), ["-r", "90"]);
});

test("caps enlarge at 4x", () => {
  const next = sheetUpscaleSize(100, 200);
  assert.deepEqual(next, { width: 400, height: 800 });
});

test("reads PNG and JPEG pixel size", () => {
  const png = Buffer.alloc(24);
  png[0] = 0x89;
  png[1] = 0x50;
  png[2] = 0x4e;
  png[3] = 0x47;
  png.writeUInt32BE(768, 16);
  png.writeUInt32BE(1024, 20);
  assert.deepEqual(readImageSize(png), { width: 768, height: 1024 });

  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x00, 0x03, 0x00, 0x03,
  ]);
  assert.deepEqual(readImageSize(jpeg), { width: 768, height: 1024 });
});

test("reads EXIF orientation 6 from a JPEG", () => {
  const exif = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12,
    0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
  ]);
  const header = Buffer.from([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  ]);
  const bytes = Buffer.concat([header, exif]);
  assert.equal(readJpegOrientation(bytes), 6);
});
