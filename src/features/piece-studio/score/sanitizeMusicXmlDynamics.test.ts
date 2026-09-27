import { describe, expect, it } from "vitest";
import { sanitizeMusicXmlDynamics } from "@/features/piece-studio/score/sanitizeMusicXmlDynamics";

const PAGANINI_STYLE = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <direction placement="below">
        <direction-type><dynamics><p/></dynamics></direction-type>
      </direction>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><rest/><duration>1</duration><type>16th</type></note>
      <direction placement="above">
        <direction-type><dynamics><mf/></dynamics></direction-type>
      </direction>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>16th</type></note>
      <direction placement="above">
        <direction-type><dynamics><p/></dynamics></direction-type>
      </direction>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>16th</type></note>
    </measure>
  </part>
</score-partwise>`;

describe("sanitizeMusicXmlDynamics", () => {
  it("keeps a single below dynamic when OMR stacks mf/p above early notes", () => {
    const out = sanitizeMusicXmlDynamics(PAGANINI_STYLE);
    expect(out).toContain('placement="below"');
    expect(out).toMatch(/<dynamics>\s*<p\s*\/>/);
    expect(out).not.toContain("<mf");
    expect(out.match(/<direction[\s>]/g)?.length).toBe(1);
  });

  it("still cleans when a MusicXML DOCTYPE is present", () => {
    const withDoctype = `<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
${PAGANINI_STYLE.replace(/^<\?xml[^>]*>\s*/i, "")}`;
    const out = sanitizeMusicXmlDynamics(withDoctype);
    expect(out).not.toContain("<mf");
    expect(out.match(/<direction[\s>]/g)?.length).toBe(1);
  });

  it("keeps spaced dynamics in the same measure", () => {
    const xml = `<?xml version="1.0"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
      <direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type></direction>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  </part>
</score-partwise>`;
    // First measure still collapses to one — OMR opening noise rule.
    const out = sanitizeMusicXmlDynamics(xml);
    expect(out.match(/<direction[\s>]/g)?.length).toBe(1);
    expect(out).toMatch(/<(p|f)\b/);
  });

  it("keeps spaced dynamics after measure 1", () => {
    const xml = `<?xml version="1.0"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
    <measure number="2">
      <direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
      <direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type></direction>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  </part>
</score-partwise>`;
    const out = sanitizeMusicXmlDynamics(xml);
    expect(out).toContain("<p");
    expect(out).toContain("<f");
    expect(out.match(/<direction[\s>]/g)?.length).toBe(2);
  });
});
