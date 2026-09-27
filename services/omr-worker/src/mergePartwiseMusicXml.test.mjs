/**
 * Run: node --test services/omr-worker/src/mergePartwiseMusicXml.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  fillEmptyMeasures,
  mergePartwiseScores,
  movementIndex,
  normalizeDivisions,
  pickOrMergeExportedScores,
  prepareMergedScoreForEngraving,
} from "./mergePartwiseMusicXml.mjs";

function tinyScore(partId, measures) {
  const body = measures
    .map(
      (n) =>
        `<measure number="${n}"><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><barline location="right"><bar-style>light-heavy</bar-style></barline></measure>`,
    )
    .join("");
  return `<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="${partId}"><part-name>Voice</part-name></score-part>
  </part-list>
  <part id="${partId}">
    ${body}
  </part>
</score-partwise>`;
}

function scoreWithDivisions(partId, divisions, measureDurations) {
  const measures = measureDurations
    .map((dur, i) => {
      const attrs =
        i === 0
          ? `<attributes><divisions>${divisions}</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>`
          : "";
      return `<measure number="${i + 1}">${attrs}<note><pitch><step>C</step><octave>4</octave></pitch><duration>${dur}</duration><type>quarter</type></note></measure>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="${partId}"><part-name>V</part-name></score-part></part-list>
  <part id="${partId}">${measures}</part>
</score-partwise>`;
}

test("movementIndex reads Audiveris mvt suffix", () => {
  assert.equal(movementIndex("paganini_24_.mvt1.mxl"), 1);
  assert.equal(movementIndex("paganini_24_.mvt13.mxl"), 13);
  assert.equal(movementIndex("twinkle.mxl"), null);
});

test("mergePartwiseScores concatenates and renumbers measures", () => {
  const a = tinyScore("P1", [1, 2]);
  const b = tinyScore("P1", [1, 2, 3]);
  const merged = mergePartwiseScores([a, b]);
  assert.ok(merged);
  assert.equal((merged.match(/<measure(?=[\s>])/g) || []).length, 5);
  assert.match(merged, /number="1"/);
  assert.match(merged, /number="5"/);
  assert.equal((merged.match(/light-light/g) || []).length, 4);
  assert.equal((merged.match(/light-heavy/g) || []).length, 1);
  assert.ok(!/<!DOCTYPE/i.test(merged));
});

test("pickOrMergeExportedScores merges mvt files in numeric order", () => {
  const exports = [
    { name: "caprice.mvt10.mxl", text: tinyScore("P1", [1]) },
    { name: "caprice.mvt2.mxl", text: tinyScore("P1", [1, 2]) },
    { name: "caprice.mvt1.mxl", text: tinyScore("P1", [1]) },
  ];
  const merged = pickOrMergeExportedScores(exports);
  assert.ok(merged);
  assert.equal((merged.match(/<measure(?=[\s>])/g) || []).length, 4);
  const numbers = [...merged.matchAll(/<measure number="(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  assert.deepEqual(numbers, [1, 2, 3, 4]);
});

test("merge ignores measure-numbering elements", () => {
  const withNumbering = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><print><measure-numbering>system</measure-numbering></print>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;
  const second = tinyScore("P1", [1]);
  const merged = mergePartwiseScores([withNumbering, second]);
  assert.equal((merged.match(/<measure(?=[\s>])/g) || []).length, 2);
  assert.match(merged, /number="2"/);
});

test("normalizeDivisions scales durations onto a shared grid", () => {
  const xml = scoreWithDivisions("P1", 4, [2, 2]);
  const out = normalizeDivisions(xml, 24);
  assert.match(out, /<divisions>24<\/divisions>/);
  assert.equal((out.match(/<duration>12<\/duration>/g) || []).length, 2);
});

test("fillEmptyMeasures replaces zero-timeline bars with a rest", () => {
  const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>24</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>48</duration></note>
    </measure>
    <measure number="2"><direction><direction-type><words>x</words></direction-type></direction></measure>
  </part>
</score-partwise>`;
  const out = fillEmptyMeasures(xml, 24);
  assert.match(out, /number="2"[^>]*>[\s\S]*<rest measure="yes"\/>/);
  assert.match(out, /<duration>48<\/duration>/);
});

test("prepareMergedScoreForEngraving keeps later key changes", () => {
  const a = scoreWithDivisions("P1", 4, [2]);
  const b = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>6</divisions><key><fifths>1</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>3</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
  const merged = mergePartwiseScores([a, b]);
  assert.ok(merged);
  assert.match(merged, /<divisions>24<\/divisions>/);
  assert.match(merged, /<fifths>1<\/fifths>/);
});

test("prepareMergedScoreForEngraving keeps balanced octave-shift", () => {
  const withOctave = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions></attributes>
      <direction><direction-type><octave-shift type="down" size="8"/></direction-type></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration></note>
      <direction><direction-type><octave-shift type="stop" size="8"/></direction-type></direction>
    </measure>
  </part>
</score-partwise>`;
  const out = prepareMergedScoreForEngraving(withOctave);
  assert.match(out, /<octave-shift type="down"/);
  assert.match(out, /<octave-shift type="stop"/);
});

test("prepareMergedScoreForEngraving drops unmatched octave-shift", () => {
  const withOctave = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>4</divisions></attributes>
      <direction><direction-type><octave-shift type="down" size="8"/></direction-type></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;
  const out = prepareMergedScoreForEngraving(withOctave);
  assert.ok(!/<octave-shift/i.test(out));
});

test("pickOrMergeExportedScores prepares a single unbroken export for OSMD", () => {
  const only = { name: "twinkle.mxl", text: tinyScore("P1", [1, 2, 3]) };
  const picked = pickOrMergeExportedScores([only]);
  assert.ok(picked);
  assert.match(picked, /<score-partwise\b/);
  assert.ok(!/<rest\/>/.test(picked));
});

test("prepareMergedScoreForEngraving does not split grace chords or pad bars", () => {
  const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>24</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><grace/><pitch><step>A</step><octave>4</octave></pitch><type>quarter</type></note>
      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>24</duration><type>quarter</type>
        <notations><tuplet type="start" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
  const out = prepareMergedScoreForEngraving(xml);
  assert.match(out, /<grace slash="yes"\/>/);
  assert.match(out, /<type>16th<\/type>/);
  assert.ok(!/<tuplet\b/i.test(out));
  assert.match(out, /<chord\s*\/>/);
  assert.ok(!/<rest\/>/.test(out));
});
