import { readFileSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { musicXmlFromBytes } from "@/features/piece-studio/score/musicXmlSource";
import { CANON_XML, TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

function mxlBytes(xml: string): Uint8Array {
  return zipSync({
    "META-INF/container.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`),
    "score.musicxml": strToU8(xml),
  });
}

describe("parseMusicXmlToScore", () => {
  it("reads notes, rests, accidentals, key, time, tempo, and dynamics", () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Fallback");
    expect(score.title).toBe("Twinkle");
    expect(score.composer).toBe("Mozart");
    expect(score.keySignature).toBe("C major");
    expect(score.timeSignature).toBe("4/4");
    expect(score.tempoBpm).toBe(100);
    expect(score.measureCount).toBe(4);
    expect(score.noteCount).toBe(14);
    expect(score.restCount).toBe(2);
    expect(score.parts).toHaveLength(1);
    const [first, second] = score.parts[0]!.measures;
    expect(first?.clef).toBe("treble");
    expect(first?.events[0]).toMatchObject({ kind: "dynamic", mark: "p" });
    const notes = first?.events.filter((e) => e.kind === "note") ?? [];
    expect(notes[0]).toMatchObject({
      kind: "note",
      durationQuarters: 1,
      type: "quarter",
      pitch: { step: "C", octave: 5, midi: 72 },
    });
    const sharp = second?.events.find(
      (e) => e.kind === "note" && e.accidental === "sharp",
    );
    expect(sharp).toMatchObject({
      kind: "note",
      accidental: "sharp",
      pitch: { step: "F", alter: 1, midi: 78 },
    });
    expect(second?.events.some((e) => e.kind === "rest")).toBe(true);
  });

  it("keeps metadata when a score has empty measures", () => {
    const score = parseMusicXmlToScore(CANON_XML, "Fallback");
    expect(score.title).toBe("Canon in D");
    expect(score.keySignature).toBe("D major");
    expect(score.tempoBpm).toBe(80);
    expect(score.measureCount).toBe(2);
    expect(score.noteCount).toBe(0);
  });

  it("preserves practical articulations on notes", () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><type>quarter</type>
        <notations>
          <articulations><staccato/><accent/></articulations>
          <fermata/>
        </notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXmlToScore(xml, "Art");
    const note = score.parts[0]?.measures[0]?.events.find((e) => e.kind === "note");
    expect(note).toMatchObject({
      kind: "note",
      articulations: expect.arrayContaining(["staccato", "accent", "fermata"]),
    });
  });
});

describe("musicXmlFromBytes", () => {
  it("unzips compressed .mxl into MusicXML", () => {
    const xml = musicXmlFromBytes(mxlBytes(TWINKLE_XML), "twinkle.mxl");
    expect(xml).toContain("<score-partwise");
    expect(parseMusicXmlToScore(xml, "Fallback").title).toBe("Twinkle");
  });

  it("reads plain .xml and .musicxml interchange bytes", () => {
    const fromMusicXml = musicXmlFromBytes(
      new TextEncoder().encode(CANON_XML),
      "canon.musicxml",
    );
    const fromXml = musicXmlFromBytes(
      new TextEncoder().encode(CANON_XML),
      "canon.xml",
    );
    expect(parseMusicXmlToScore(fromMusicXml, "Fallback").composer).toBe(
      "Johann Pachelbel",
    );
    expect(parseMusicXmlToScore(fromXml, "Fallback").title).toBe("Canon in D");
  });
});

describe("piece score isolation", () => {
  it("keeps OSMD behind ScoreRenderer and out of Scale Studio notation", () => {
    const root = path.join(process.cwd(), "src");
    const renderer = readFileSync(
      path.join(
        root,
        "features/piece-studio/score/OpenSheetMusicDisplayRenderer.ts",
      ),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(root, "features/piece-studio/score/OsmdScoreAdapter.tsx"),
      "utf8",
    );
    const parser = readFileSync(
      path.join(root, "features/piece-studio/score/parseMusicXml.ts"),
      "utf8",
    );
    const timeline = readFileSync(
      path.join(root, "features/piece-studio/playback/playbackTimeline.ts"),
      "utf8",
    );
    const catalog = readFileSync(
      path.join(root, "features/piece-studio/pieceStudioCatalog.ts"),
      "utf8",
    );
    const scaleStaff = readFileSync(
      path.join(root, "components/ScaleTrebleStaff.tsx"),
      "utf8",
    );
    expect(renderer).toMatch(/opensheetmusicdisplay/);
    expect(adapter).not.toMatch(/opensheetmusicdisplay/);
    expect(adapter).toMatch(/createDefaultScoreRenderer|ScoreRenderer/);
    expect(parser).not.toMatch(/opensheetmusicdisplay/);
    expect(timeline).not.toMatch(/opensheetmusicdisplay/);
    expect(catalog).not.toMatch(/opensheetmusicdisplay/);
    expect(scaleStaff).not.toMatch(/opensheetmusicdisplay/);
    expect(scaleStaff).not.toMatch(/piece-studio/);
  });
});
