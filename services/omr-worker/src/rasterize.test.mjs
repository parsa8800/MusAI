/**
 * Run: node --test services/omr-worker/src/rasterize.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  PDF_PHOTO_LONG_EDGE_PT,
  pdfPageIsPhotoScale,
} from "./rasterize.mjs";

test("letter pages are not treated as phone photos", () => {
  assert.equal(pdfPageIsPhotoScale(792), false);
  assert.equal(pdfPageIsPhotoScale(PDF_PHOTO_LONG_EDGE_PT), false);
});

test("a phone photo saved as PDF is photo scale", () => {
  assert.equal(pdfPageIsPhotoScale(4032), true);
});
