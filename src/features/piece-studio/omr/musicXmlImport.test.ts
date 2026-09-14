/**
 * Regression: direct MusicXML / XML / MXL import must not use the OMR worker.
 * Uses fixtures/piece-import and in-memory TWINKLE_XML.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  clearPieceCatalog,
  listPieceWorkspaces,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import {
  commitPieceImport,
  importPieceFromFile,
  PIECE_STUDIO_UPLOAD_ACCEPT,
} from "@/features/piece-studio/pieceStudioImport";
import { sourceKindFromFile } from "@/features/piece-studio/pieceStudioScore";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";

const FIXTURES = path.join(process.cwd(), "fixtures/piece-import");

function fileFromFixture(name: string, mime: string): File {
  const buf = readFileSync(path.join(FIXTURES, name));
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new File([bytes], name, { type: mime });
}

afterEach(() => {
  clearPieceCatalog();
  clearPieceFileMemory();
});

describe("direct MusicXML import (no OMR)", () => {
  it("accept attribute lists .musicxml, .xml, and .mxl", () => {
    expect(PIECE_STUDIO_UPLOAD_ACCEPT).toContain(".musicxml");
    expect(PIECE_STUDIO_UPLOAD_ACCEPT).toContain(".xml");
    expect(PIECE_STUDIO_UPLOAD_ACCEPT).toContain(".mxl");
    expect(PIECE_STUDIO_UPLOAD_ACCEPT).toContain(".pdf");
  });

  it("classifies digital scores from extension even with empty MIME", () => {
    expect(sourceKindFromFile("twinkle.musicxml", "")).toBe("musicxml");
    expect(sourceKindFromFile("twinkle.xml", "")).toBe("musicxml");
    expect(sourceKindFromFile("twinkle.mxl", "")).toBe("musicxml");
    expect(sourceKindFromFile("twinkle.musicxml", "application/octet-stream")).toBe(
      "musicxml",
    );
  });

  it.each([
    ["twinkle.musicxml", ""],
    ["twinkle.musicxml", "application/octet-stream"],
    ["twinkle.musicxml", "text/xml"],
  ] as const)(
    "fixture %s (mime %s): parse → validate → ready draft without recognizeSheet",
    async (name, mime) => {
      const recognizeSheet = vi.fn(async () => {
        throw new Error("OMR must not run for MusicXML");
      });
      const before = listPieceWorkspaces().length;
      const result = await importPieceFromFile(
        fileFromFixture(name, mime),
        new Date(),
        { recognizeSheet },
      );
      expect(recognizeSheet).not.toHaveBeenCalled();
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(listPieceWorkspaces()).toHaveLength(before);
      expect(result.draft.sourceKind).toBe("musicxml");
      expect(result.draft.musicXml).toContain("<score-partwise");
      expect(result.draft.structured?.noteCount).toBe(14);
      expect(result.draft.title).toBe("Twinkle");

      const piece = await commitPieceImport(result.draft);
      expect(listPieceWorkspaces()).toHaveLength(before + 1);
      expect(piece.recognitionConfirmed).toBe(true);
      expect(await readPieceRecognizedMusicXml(piece.pieceId)).toContain("Twinkle");
      expect((await readPieceStructuredScore(piece.pieceId))?.noteCount).toBe(14);
    },
  );

  it("imports plain .xml with empty MIME through the same pipeline", async () => {
    const recognizeSheet = vi.fn();
    const result = await importPieceFromFile(
      new File([TWINKLE_XML], "melody.xml", { type: "" }),
      new Date(),
      { recognizeSheet },
    );
    expect(recognizeSheet).not.toHaveBeenCalled();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.structured?.noteCount).toBe(14);
  });

  it("imports compressed .mxl with empty MIME without calling OMR", async () => {
    const packed = zipSync({
      "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container><rootfiles>
  <rootfile full-path="score.musicxml"/>
</rootfiles></container>`),
      "score.musicxml": strToU8(TWINKLE_XML),
    });
    const recognizeSheet = vi.fn(async () => {
      throw new Error("OMR offline");
    });
    const result = await importPieceFromFile(
      new File([packed], "Twinkle.mxl", { type: "" }),
      new Date(),
      { recognizeSheet },
    );
    expect(recognizeSheet).not.toHaveBeenCalled();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.structured?.noteCount).toBe(14);
  });

  it("imports multi-staff fixture without OMR", async () => {
    const result = await importPieceFromFile(
      fileFromFixture("two-staff-study.musicxml", ""),
      new Date(),
      {
        recognizeSheet: async () => {
          throw new Error("OMR offline");
        },
      },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.structured?.parts).toHaveLength(2);
  });

  it("failed digital parse stays a draft and never catalogs", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      new File(["<xml>nope</xml>"], "bad.musicxml", { type: "" }),
    );
    expect(result.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("parses score-timewise into the MusAI score model", () => {
    const timewise = `<?xml version="1.0"?>
<score-timewise version="3.1">
  <work><work-title>Timewise Twinkle</work-title></work>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <measure number="1">
    <part id="P1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </part>
  </measure>
</score-timewise>`;
    const score = parseMusicXmlToScore(timewise, "Fallback");
    expect(score.title).toBe("Timewise Twinkle");
    expect(score.noteCount).toBe(4);
    expect(score.parts).toHaveLength(1);
    expect(score.keySignature).toBe("C major");
  });
});
