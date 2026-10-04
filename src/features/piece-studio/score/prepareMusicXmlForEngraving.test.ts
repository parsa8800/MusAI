import { describe, expect, it } from "vitest";
import {
  fillEmptyMeasures,
  fixIllegalBeams,
  keepMusicalAttributes,
  normalizeDivisions,
  prepareMusicXmlForEngraving,
  sanitizeGraceNotes,
} from "@/features/piece-studio/score/prepareMusicXmlForEngraving";

function scoreWithDivisions(
  partId: string,
  divisions: number,
  measureDurations: number[],
): string {
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
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="${partId}"><part-name>V</part-name></score-part></part-list>
  <part id="${partId}">${measures}</part>
</score-partwise>`;
}

describe("prepareMusicXmlForEngraving", () => {
  it("normalizes divisions onto a shared grid", () => {
    const out = normalizeDivisions(scoreWithDivisions("P1", 4, [2, 2]), 24);
    expect(out).toContain("<divisions>24</divisions>");
    expect(out.match(/<duration>12<\/duration>/g)?.length).toBe(2);
  });

  it("fills empty measures with a whole-measure rest", () => {
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
    expect(out).toMatch(/number="2"[^>]*>[\s\S]*<rest measure="yes"\/>/);
  });

  it("strips the DOCTYPE and keeps a first attributes block", () => {
    const a = scoreWithDivisions("P1", 4, [2]);
    const b = scoreWithDivisions("P1", 6, [3]).replace(
      /^[\s\S]*?<part id="P1">/,
      "",
    );
    const merged = a.replace(
      "</part>",
      `${b.match(/<measure[\s\S]*<\/measure>/)?.[0] || ""}</part>`,
    );
    const out = prepareMusicXmlForEngraving(merged);
    expect(out).not.toMatch(/<!DOCTYPE/i);
    expect(out).toContain("<divisions>24</divisions>");
    expect(out.match(/<attributes>/g)?.length).toBe(1);
  });

  it("keeps printed line breaks and drops invented scan marks", () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <print><measure-numbering>system</measure-numbering></print>
      <attributes><divisions>24</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type><sound dynamics="56"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>24</duration><type>quarter</type>
        <notations><articulations><staccato/></articulations><fermata/></notations>
      </note>
    </measure>
    <measure number="4">
      <print new-page="yes" new-system="yes"><system-layout><system-distance>12</system-distance></system-layout></print>
      <direction placement="above"><direction-type><dynamics><mp/></dynamics></direction-type></direction>
      <direction placement="above"><direction-type><words>Allegro</words></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>24</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const out = prepareMusicXmlForEngraving(xml);
    expect(out).toMatch(/<dynamics>\s*<p\s*\/>/);
    expect(out).toMatch(/<dynamics>\s*<mp\s*\/>/);
    expect(out).not.toMatch(/<staccato\b/i);
    expect(out).not.toMatch(/<fermata\b/i);
    expect(out).not.toMatch(/measure-numbering/i);
    expect(out).toMatch(/<print new-system="yes" new-page="yes"\/>/);
    expect(out).toMatch(/<words>Allegro<\/words>/);
  });

  it("keeps later key changes and drops duplicate divisions", () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>24</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>48</duration><type>half</type></note>
    </measure>
    <measure number="2"><attributes><divisions>24</divisions><key><fifths>1</fifths></key></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>48</duration><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const out = keepMusicalAttributes(xml);
    expect(out.match(/<attributes>/g)?.length).toBe(2);
    expect(out).toContain("<fifths>1</fifths>");
    expect((out.match(/<divisions>/g) || []).length).toBe(1);
  });

  it("does not invent rests in underfull bars", () => {
    const xml = scoreWithDivisions("P1", 24, [24]);
    const out = prepareMusicXmlForEngraving(xml);
    expect(out).not.toMatch(/<rest\/>/);
  });

  it("sanitizes grace display without splitting a following chord", () => {
    const xml = `<note><grace/><pitch><step>A</step><octave>4</octave></pitch><type>quarter</type></note>
<note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>12</duration><type>eighth</type></note>`;
    const out = sanitizeGraceNotes(xml);
    expect(out).toContain('<grace slash="yes"/>');
    expect(out).toContain("<type>16th</type>");
    expect(out).toMatch(/<chord\s*\/>/);
  });

  it("removes beams from quarter notes and chord heads", () => {
    const xml = `<note><pitch><step>D</step><octave>5</octave></pitch><duration>24</duration><type>quarter</type><beam number="1">continue</beam></note>
<note><chord/><pitch><step>F</step><octave>5</octave></pitch><duration>12</duration><type>eighth</type><beam number="1">begin</beam></note>`;
    const out = fixIllegalBeams(xml);
    expect(out).not.toMatch(/<beam\b/);
  });
});
