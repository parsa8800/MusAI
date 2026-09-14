import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  clearPieceCatalog,
  getPieceWorkspaceBySlug,
  listPieceWorkspaces,
  upsertPieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import {
  commitPieceImport,
  importPieceFromFile,
} from "@/features/piece-studio/pieceStudioImport";
import { uniquePieceSlug } from "@/features/piece-studio/pieceStudioRoutes";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import { CANON_XML, TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";

async function importCommitted(file: File, deps?: Parameters<typeof importPieceFromFile>[2]) {
  const result = await importPieceFromFile(file, new Date(), deps);
  if (result.status === "committed") return result.piece;
  if (result.status === "ready") return commitPieceImport(result.draft);
  throw new Error(`expected ready/committed import, got ${result.status}`);
}

function workspace(partial: Partial<PieceWorkspaceV1>): PieceWorkspaceV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    pieceId: "p1",
    slug: "canon-in-d",
    title: "Canon in D",
    composer: "Pachelbel",
    sourceKind: "musicxml",
    sourceFileName: "Canon in D.musicxml",
    sourceMimeType: "application/xml",
    importedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    lastView: "score",
    score: {
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      format: "musicxml",
      title: "Canon in D",
      composer: "Pachelbel",
      keySignature: "D major",
      timeSignature: "4/4",
      tempoBpm: 80,
      measureCount: 12,
      hasStructuredScore: true,
      noteCount: 0,
      restCount: 0,
    },
    attempts: [],
    progressPercent: 0,
    hasOriginalFile: true,
    ...partial,
  };
}

describe("piece studio persistence", () => {
  afterEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
  });

  it("keeps two pieces in separate workspaces", () => {
    upsertPieceWorkspace(workspace({ pieceId: "a", slug: "canon-in-d" }));
    upsertPieceWorkspace(
      workspace({
        pieceId: "b",
        slug: "minuet",
        title: "Minuet",
        lastOpenedAt: "2026-02-01T00:00:00.000Z",
      }),
    );
    const listed = listPieceWorkspaces();
    expect(listed.map((p) => p.slug)).toEqual(["minuet", "canon-in-d"]);
    expect(getPieceWorkspaceBySlug("canon-in-d")?.title).toBe("Canon in D");
    expect(getPieceWorkspaceBySlug("minuet")?.pieceId).toBe("b");
  });

  it("imports MusicXML into a persistent slug and stores attempts/progress fields", async () => {
    const file = new File([CANON_XML], "Canon in D.musicxml", {
      type: "application/xml",
    });
    const piece = await importCommitted(file);
    expect(piece.slug).toBe("canon-in-d");
    expect(piece.title).toBe("Canon in D");
    expect(piece.composer).toBe("Johann Pachelbel");
    expect(piece.score.keySignature).toBe("D major");
    expect(piece.score.hasStructuredScore).toBe(true);
    expect(piece.attempts).toEqual([]);
    expect(piece.progressPercent).toBe(0);
    expect(getPieceWorkspaceBySlug("canon-in-d")?.pieceId).toBe(piece.pieceId);
    const structured = await readPieceStructuredScore(piece.pieceId);
    expect(structured?.measureCount).toBe(2);
  });

  it("imports compressed .mxl without treating it as plain text", async () => {
    const packed = zipSync({
      "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container><rootfiles>
  <rootfile full-path="score.musicxml"/>
</rootfiles></container>`),
      "score.musicxml": strToU8(TWINKLE_XML),
    });
    const piece = await importCommitted(
      new File([packed], "Twinkle.mxl", {
        type: "application/vnd.recordare.musicxml",
      }),
    );
    expect(piece.title).toBe("Twinkle");
    expect(piece.sourceKind).toBe("musicxml");
    expect(piece.score.noteCount).toBe(14);
    expect(piece.score.restCount).toBe(2);
    expect(piece.score.hasStructuredScore).toBe(true);
    const structured = await readPieceStructuredScore(piece.pieceId);
    expect(structured?.parts[0]?.measures[1]?.events.some((e) => e.kind === "rest")).toBe(
      true,
    );
  });

  it("does not reuse another piece’s slug", async () => {
    await importCommitted(
      new File([CANON_XML], "Canon in D.musicxml", { type: "application/xml" }),
    );
    const second = await importCommitted(
      new File([CANON_XML], "Canon in D.musicxml", { type: "application/xml" }),
    );
    expect(second.slug).toBe("canon-in-d-2");
    expect(listPieceWorkspaces()).toHaveLength(2);
  });

  it("increments a colliding slug", () => {
    expect(uniquePieceSlug("canon-in-d", ["canon-in-d"])).toBe("canon-in-d-2");
    expect(uniquePieceSlug("canon-in-d", ["canon-in-d", "canon-in-d-2"])).toBe(
      "canon-in-d-3",
    );
  });

  it("imports plain .xml into the same MusAI score pipeline", async () => {
    const piece = await importCommitted(
      new File([TWINKLE_XML], "twinkle.xml", { type: "application/xml" }),
    );
    expect(piece.sourceKind).toBe("musicxml");
    expect(piece.score.hasStructuredScore).toBe(true);
    expect(piece.score.noteCount).toBe(14);
    expect(piece.recognitionConfirmed).toBe(true);
    const structured = await readPieceStructuredScore(piece.pieceId);
    expect(structured?.parts[0]?.measures[0]?.events.some((e) => e.kind === "note")).toBe(
      true,
    );
    expect(await readPieceRecognizedMusicXml(piece.pieceId)).toContain("score-partwise");
  });

  it("does not send MusicXML through sheet-music recognition", async () => {
    const recognizeSheet = vi.fn(async () => TWINKLE_XML);
    await importCommitted(
      new File([CANON_XML], "Canon in D.musicxml", { type: "application/xml" }),
      { recognizeSheet },
    );
    expect(recognizeSheet).not.toHaveBeenCalled();
  });

  it("reads a PDF into a temporary draft until the score is confirmed", async () => {
    const recognizeSheet = vi.fn(async () => TWINKLE_XML);
    const file = new File(["%PDF-1.4"], "Etude.pdf", { type: "application/pdf" });
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(file, new Date(), { recognizeSheet });
    expect(recognizeSheet).toHaveBeenCalledOnce();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.sourceKind).toBe("pdf");
    expect(result.draft.recognitionStatus).toBe("ready");
    expect(result.draft.structured?.noteCount).toBe(14);
    expect(result.draft.title).toBe("Twinkle");
    expect(listPieceWorkspaces()).toHaveLength(before);
    expect(await readPieceOriginalFile(result.draft.sessionId)).toBeNull();

    const piece = await commitPieceImport(result.draft);
    expect(piece.recognitionConfirmed).toBe(true);
    expect(piece.hasOriginalFile).toBe(true);
    expect(piece.score.hasStructuredScore).toBe(true);
    expect(await readPieceOriginalFile(piece.pieceId)).toBeTruthy();
    expect(await readPieceRecognizedMusicXml(piece.pieceId)).toContain("Twinkle");
    expect((await readPieceStructuredScore(piece.pieceId))?.noteCount).toBe(14);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
  });

  it("does not add a library piece when reading fails", async () => {
    const recognizeSheet = vi.fn(async () => {
      throw new Error(OMR_COPY.noMusic);
    });
    const file = new File(["png"], "page.png", { type: "image/png" });
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(file, new Date(), { recognizeSheet });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.draft.sourceKind).toBe("image");
    expect(result.draft.recognitionStatus).toBe("failed");
    expect(result.draft.recognitionMessage).toBe(OMR_COPY.noMusic);
    expect(result.draft.musicXml).toBeNull();
    expect(result.draft.structured).toBeNull();
    expect(result.draft.file).toBe(file);
    expect(listPieceWorkspaces()).toHaveLength(before);
    expect(getPieceWorkspaceBySlug("page")).toBeNull();
  });
});
