/**
 * Run: node --test services/omr-worker/src/findPrintedHairpins.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { hairpinsInGrayImage } from "./findPrintedHairpins.mjs";

function blank(width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(new Uint8Array(width).fill(255));
  return rows;
}

function line(rows, x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    if (rows[y] && rows[y][x] != null) rows[y][x] = 0;
  }
}

const sheet = `<?xml version="1.0"?>
<sheet>
  <interline main="20"/>
  <system id="1">
    <staff><lines><line>
      <point x="0" y="40"/><point x="1" y="80"/>
    </line></lines></staff>
  </system>
  <system id="2">
    <staff><lines><line>
      <point x="0" y="200"/><point x="1" y="240"/>
    </line></lines></staff>
  </system>
</sheet>`;

test("reads a decrescendo from the ink under a staff", () => {
  const rows = blank(360, 280);
  line(rows, 40, 105, 260, 140);
  line(rows, 40, 170, 260, 140);
  const found = hairpinsInGrayImage({ width: 360, height: 280, rows }, sheet);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, "diminuendo");
  assert.ok(found[0].x < 80);
  assert.ok(found[0].x + found[0].w > 200);
});
