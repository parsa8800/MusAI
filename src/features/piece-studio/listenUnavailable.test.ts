import { listenUnavailable } from "@/features/piece-studio/listenUnavailable";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { describe, expect, it } from "vitest";

function piece(partial: Partial<PieceWorkspaceV1> = {}): PieceWorkspaceV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    pieceId: "p",
    slug: "p",
    title: "Piece",
    composer: null,
    sourceKind: "musicxml",
    sourceFileName: "p.musicxml",
    sourceMimeType: "application/xml",
    importedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    lastView: "listen",
    score: {
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      format: "musicxml",
      title: "Piece",
      composer: null,
      keySignature: null,
      timeSignature: "4/4",
      tempoBpm: 100,
      measureCount: 1,
      hasStructuredScore: true,
      noteCount: 1,
      restCount: 0,
    },
    attempts: [],
    progressPercent: 0,
    hasOriginalFile: true,
    recognitionStatus: "none",
    recognitionConfirmed: true,
    ...partial,
  };
}

describe("listenUnavailable", () => {
  const structured = parseMusicXmlToScore(TWINKLE_XML, "Twinkle");

  it("allows playback whenever the score is ready, including confirmed PDF/image", () => {
    expect(listenUnavailable(piece({ sourceKind: "pdf" }), true, structured)).toBeNull();
    expect(
      listenUnavailable(
        piece({
          sourceKind: "image",
          recognitionStatus: "ready",
          recognitionConfirmed: true,
        }),
        true,
        structured,
      ),
    ).toBeNull();
  });

  it("never implies a confirmed scan still needs reading", () => {
    const msg = listenUnavailable(
      piece({
        sourceKind: "pdf",
        recognitionStatus: "ready",
        recognitionConfirmed: true,
        score: {
          ...piece().score,
          hasStructuredScore: false,
          noteCount: 0,
          measureCount: 0,
        },
      }),
      false,
      null,
    );
    expect(msg).toMatch(/doesn’t have timing to play yet/i);
    expect(msg).not.toMatch(/page can be read/i);
  });

  it("holds prepare copy while the structured score is still loading", () => {
    expect(
      listenUnavailable(piece({ sourceKind: "musicxml" }), false, undefined),
    ).toMatch(/Preparing playback/i);
  });
});
