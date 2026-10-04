/**
 * Run: node --test services/omr-worker/src/recoverPrintedDynamics.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { recoverPrintedDynamics } from "./recoverPrintedDynamics.mjs";

const STACKS = [
  [314, 1384],
  [1384, 2363],
  [2363, 3319],
  [319, 1307],
  [1307, 2229],
  [2229, 3316],
  [325, 1571],
  [1571, 2378],
  [2378, 3310],
  [327, 1470],
  [1470, 2400],
  [2400, 3298],
];

const SYSTEMS = [
  { top: 548, bottom: 691, stacks: STACKS.slice(0, 3) },
  { top: 987, bottom: 1125, stacks: STACKS.slice(3, 6) },
  { top: 1423, bottom: 1554, stacks: STACKS.slice(6, 9) },
  { top: 1853, bottom: 1979, stacks: STACKS.slice(9, 12) },
];

/** Glyphs from a one-page scan: faint false marks, real p / f / hairpins / ff. */
const SHEET = `<?xml version="1.0"?>
<sheet>
  <interline min="30" main="31" max="32"/>
  ${SYSTEMS.map(
    (system, index) => `<system id="${index + 1}">
      <staff id="${index + 1}"><lines><line>
        <point x="0" y="${system.top}"/><point x="1" y="${system.bottom}"/>
      </line></lines></staff>
      ${system.stacks
        .map(
          ([left, right]) => `<stack left="${left}" right="${right}"/>`,
        )
        .join("")}
    </system>`,
  ).join("")}
  <dynamics shape="DYNAMICS_PP" grade="0.272" ctx-grade="0.555"><bounds x="606" y="460" w="89" h="58"/></dynamics>
  <dynamics shape="DYNAMICS_P" grade="0.236" ctx-grade="0.51"><bounds x="743" y="462" w="40" h="57"/></dynamics>
  <dynamics shape="DYNAMICS_P" grade="0.645" ctx-grade="0.859"><bounds x="563" y="729" w="97" h="96"/></dynamics>
  <dynamics shape="DYNAMICS_F" grade="0.425" ctx-grade="0.713"><bounds x="1305" y="1186" w="116" h="140"/></dynamics>
  <dynamics shape="DYNAMICS_F" grade="0.591" ctx-grade="0.829"><bounds x="2390" y="2092" w="106" h="127"/></dynamics>
  <dynamics shape="DYNAMICS_F" grade="0.611" ctx-grade="0.84"><bounds x="2450" y="2092" w="106" h="127"/></dynamics>
  <wedge shape="DIMINUENDO" grade="0.758"><bounds x="898" y="1621" w="775" h="117"/></wedge>
  <wedge shape="CRESCENDO" grade="0.77"><bounds x="1527" y="2119" w="818" h="63"/></wedge>
</sheet>`;

function bar(number, inner = "") {
  return `<measure number="${number}">${inner}<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure>`;
}

function score() {
  const bars = [
    bar(
      1,
      `<print><measure-numbering>system</measure-numbering></print><attributes><divisions>1</divisions></attributes><direction placement="above"><direction-type><dynamics><pp/></dynamics></direction-type></direction><direction placement="above"><direction-type><words>Happily</words></direction-type></direction>`,
    ),
    ...Array.from({ length: 10 }, (_, index) => bar(index + 2)),
    bar(
      12,
      `<direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type></direction><direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type></direction>`,
    ),
  ].join("");
  const second = `<part id="P2">${bar(1)}${bar(5)}${bar(12)}</part>`;
  return `<score-partwise><part id="P1">${bars}</part>${second}</score-partwise>`;
}

function measureBody(xml, number) {
  const match = xml.match(
    new RegExp(
      `<measure(?=[\\s>])[^>]*\\bnumber="${number}"[^>]*>([\\s\\S]*?)<\\/measure(?![A-Za-z0-9_-])`,
    ),
  );
  return match ? match[1] : "";
}

test("puts printed dynamics and hairpins on the bars that contain them", () => {
  const out = recoverPrintedDynamics(score(), [SHEET]);
  const bar1 = measureBody(out, 1);
  const bar5 = measureBody(out, 5);
  const bar7 = measureBody(out, 7);
  const bar8 = measureBody(out, 8);
  const bar11 = measureBody(out, 11);
  const bar12 = measureBody(out, 12);

  assert.match(bar1, /<p\s*\/>/);
  assert.doesNotMatch(bar1, /<pp\b/);
  assert.match(bar1, /<words>Happily<\/words>/);
  assert.match(bar1, /<measure-numbering>system<\/measure-numbering>/);
  assert.match(bar5, /<f\s*\/>/);
  assert.match(bar7, /<wedge type="diminuendo"/);
  assert.match(bar8, /<wedge type="stop"/);
  assert.doesNotMatch(bar8, /<wedge type="diminuendo"/);
  assert.match(bar11, /<wedge type="crescendo"/);
  assert.match(bar11, /<wedge type="stop"/);
  assert.doesNotMatch(bar12, /<wedge\b/);
  assert.match(bar12, /<ff\s*\/>/);
  assert.equal((bar12.match(/<f\s*\/>/g) || []).length, 0);
  assert.equal((out.match(/<pp\b/g) || []).length, 0);

  const second = out.split(/<part\b[^>]*id="P2"[^>]*>/i)[1] || "";
  assert.equal((second.match(/<dynamics\b|<wedge\b/gi) || []).length, 0);
});

test("drops faint dynamics when none of them are confident", () => {
  const faint = `<sheet><stack left="0" right="100"/><dynamics shape="DYNAMICS_PP" grade="0.2"><bounds x="10" y="10" w="20" h="20"/></dynamics></sheet>`;
  const xml = `<score-partwise><part id="P1">${bar(1, `<direction><direction-type><dynamics><pp/></dynamics></direction-type></direction>`)}</part></score-partwise>`;
  const out = recoverPrintedDynamics(xml, [faint]);
  assert.doesNotMatch(out, /<pp\b/);
  assert.doesNotMatch(out, /<dynamics\b/);
});

test("leaves the score alone when the book has no dynamic glyphs", () => {
  const bare = `<sheet><stack left="0" right="100"/></sheet>`;
  const xml = `<score-partwise><part id="P1">${bar(1, `<direction><direction-type><dynamics><p/></dynamics></direction-type></direction>`)}</part></score-partwise>`;
  const out = recoverPrintedDynamics(xml, [bare]);
  assert.match(out, /<p\s*\/>/);
});
