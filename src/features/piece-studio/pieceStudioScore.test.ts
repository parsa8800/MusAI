import { describe, expect, it } from "vitest";
import {
  digitalScoreFromImport,
  parseMusicXmlScore,
  sourceKindFromFile,
  titleFromFileName,
} from "@/features/piece-studio/pieceStudioScore";
import { CANON_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("pieceStudioScore", () => {
  it("titles a piece from its file name", () => {
    expect(titleFromFileName("Canon_in_D.musicxml")).toBe("Canon in D");
    expect(titleFromFileName("untitled.wav")).toBe("Untitled");
  });

  it("classifies source files without treating svg as MusicXML", () => {
    expect(sourceKindFromFile("Canon in D.musicxml", "")).toBe("musicxml");
    expect(sourceKindFromFile("canon.mxl", "")).toBe("musicxml");
    expect(sourceKindFromFile("score.xml", "")).toBe("musicxml");
    expect(sourceKindFromFile("twinkle.musicxml", "application/octet-stream")).toBe(
      "musicxml",
    );
    expect(sourceKindFromFile("score.pdf", "application/pdf")).toBe("pdf");
    expect(sourceKindFromFile("page.png", "image/png")).toBe("image");
    expect(sourceKindFromFile("ref.mp3", "audio/mpeg")).toBe("audio");
    expect(sourceKindFromFile("mark.svg", "image/svg+xml")).toBe("image");
  });

  it("reads title, composer, key, time, and tempo from MusicXML", () => {
    const score = parseMusicXmlScore(CANON_XML, "Fallback");
    expect(score.title).toBe("Canon in D");
    expect(score.composer).toBe("Johann Pachelbel");
    expect(score.keySignature).toBe("D major");
    expect(score.timeSignature).toBe("4/4");
    expect(score.tempoBpm).toBe(80);
    expect(score.measureCount).toBe(2);
    expect(score.hasStructuredScore).toBe(true);
  });

  it("falls back to the file name when MusicXML has no work title", () => {
    const score = digitalScoreFromImport({
      kind: "pdf",
      fileName: "Minuet.pdf",
    });
    expect(score.title).toBe("Minuet");
    expect(score.format).toBe("pdf");
    expect(score.hasStructuredScore).toBe(false);
  });
});
