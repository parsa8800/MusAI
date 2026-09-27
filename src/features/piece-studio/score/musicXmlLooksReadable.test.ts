import { describe, expect, it } from "vitest";
import { musicXmlLooksReadable } from "@/features/piece-studio/score/musicXmlLooksReadable";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("musicXmlLooksReadable", () => {
  it("accepts normal partwise MusicXML", () => {
    expect(musicXmlLooksReadable(TWINKLE_XML)).toBe(true);
  });

  it("accepts Audiveris-style exports with part id", () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>1</duration></note></measure></part>
</score-partwise>`;
    expect(musicXmlLooksReadable(xml)).toBe(true);
  });

  it("rejects empty or non-score text", () => {
    expect(musicXmlLooksReadable("")).toBe(false);
    expect(musicXmlLooksReadable("not music")).toBe(false);
    expect(musicXmlLooksReadable("<score-partwise></score-partwise>")).toBe(
      false,
    );
  });
});
