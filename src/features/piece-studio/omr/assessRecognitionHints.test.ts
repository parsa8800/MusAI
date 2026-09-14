import { describe, expect, it } from "vitest";
import {
  assessRecognition,
  assessRecognitionHints,
  measureWholeNoteSpan,
} from "@/features/piece-studio/omr/assessRecognitionHints";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("assessRecognition", () => {
  it("stays quiet for a normal scan so the compare UI can lead", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    const result = assessRecognition(score);
    expect(result.focusMeasureIndex).toBeNull();
    expect(result.hints).toEqual([]);
  });

  it("flags sparse scores with a subtle check + measure focus", () => {
    const empty = parseMusicXmlToScore(
      `<?xml version="1.0"?>
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
        <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
          <note><rest/><duration>4</duration><type>whole</type></note>
        </measure></part>
      </score-partwise>`,
      "Untitled",
    );
    const result = assessRecognition(empty);
    expect(result.hints).toEqual(["Check this section"]);
    expect(result.focusMeasureIndex).toBe(0);
    expect(assessRecognitionHints(empty)).toEqual(["Check this section"]);
  });

  it("highlights an empty bar when later bars have notes", () => {
    const score = parseMusicXmlToScore(
      `<?xml version="1.0"?>
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1"><attributes><divisions>1</divisions></attributes></measure>
          <measure number="2">
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
          </measure>
        </part>
      </score-partwise>`,
      "Gap",
    );
    const result = assessRecognition(score);
    expect(result.hints).toEqual(["Check this section"]);
    expect(result.focusMeasureIndex).toBe(0);
    const span = measureWholeNoteSpan(score, 0);
    expect(span).not.toBeNull();
    expect(span!.endWholeNotes).toBeGreaterThan(span!.startWholeNotes);
  });
});
