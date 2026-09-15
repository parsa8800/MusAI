import { afterEach, describe, expect, it } from "vitest";
import {
  clearPieceFileMemory,
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
  savePieceOriginalFile,
  savePieceRecognizedMusicXml,
  savePieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

describe("pieceStudioFiles persistence", () => {
  afterEach(() => {
    clearPieceFileMemory();
  });

  it("mirrors MusicXML and structured score in memory so workspace reload can read them", async () => {
    const pieceId = "persist-twinkle";
    const structured = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");
    await savePieceOriginalFile(
      pieceId,
      new Blob([TWINKLE_XML], { type: "application/xml" }),
    );
    await savePieceRecognizedMusicXml(pieceId, TWINKLE_XML);
    await savePieceStructuredScore(pieceId, structured);

    expect(await readPieceRecognizedMusicXml(pieceId)).toContain("Twinkle");
    expect((await readPieceStructuredScore(pieceId))?.noteCount).toBe(
      structured.noteCount,
    );
    expect(await readPieceOriginalFile(pieceId)).toBeTruthy();
  });

  it("rejects empty recognized MusicXML", async () => {
    await expect(savePieceRecognizedMusicXml("x", "   ")).rejects.toThrow(
      /empty/i,
    );
  });
});
