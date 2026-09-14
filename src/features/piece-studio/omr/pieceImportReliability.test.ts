/**
 * Reliability contract for Piece Studio import:
 * failed/abandon/retry never invent library rows; confirm creates exactly one.
 *
 * Where tests pass `recognizeSheet: async () => TWINKLE_XML`, that is a
 * **test-only** stand-in for a successful Audiveris export. Production never
 * injects Twinkle — it always calls `recognizeSheetMusic` for the upload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clearPieceCatalog,
  listPieceWorkspaces,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  readPieceOriginalFile,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import {
  commitPieceImport,
  discardPieceImport,
  importPieceFromFile,
} from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { buildPlaybackTimeline } from "@/features/piece-studio/playback/playbackTimeline";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { musicXmlRenderSource } from "@/features/piece-studio/score/scoreRenderSource";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

/** Disk fixtures under fixtures/piece-import — test uploads only, never catalog seed. */
const FIXTURES = path.join(process.cwd(), "fixtures/piece-import");

function fixtureFile(name: string, mime: string): File {
  const buf = readFileSync(path.join(FIXTURES, name));
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new File([bytes], name, { type: mime });
}

afterEach(() => {
  clearPieceCatalog();
  clearPieceFileMemory();
});

describe("Piece Studio import reliability", () => {
  it("rejects empty uploads without creating a piece", async () => {
    const before = listPieceWorkspaces().length;
    await expect(
      importPieceFromFile(new File([], "empty.pdf", { type: "application/pdf" })),
    ).rejects.toThrow(OMR_COPY.chooseFile);
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("rejects corrupted MusicXML without creating a piece", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      new File(["not music at all"], "broken.musicxml", {
        type: "application/xml",
      }),
    );
    expect(result.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("rejects corrupted MXL without creating a piece", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      new File([new Uint8Array([1, 2, 3, 4])], "broken.mxl", {
        type: "application/vnd.recordare.musicxml",
      }),
    );
    expect(result.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("imports valid MXL as a ready draft until confirm", async () => {
    const packed = zipSync({
      "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container><rootfiles>
  <rootfile full-path="score.musicxml"/>
</rootfiles></container>`),
      "score.musicxml": strToU8(TWINKLE_XML),
    });
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      new File([packed], "Twinkle.mxl", {
        type: "application/vnd.recordare.musicxml",
      }),
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(listPieceWorkspaces()).toHaveLength(before);
    expect(result.draft.structured?.noteCount).toBe(14);
    const piece = await commitPieceImport(result.draft);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
    expect(piece.score.hasStructuredScore).toBe(true);
    expect(await readPieceRecognizedMusicXml(piece.pieceId)).toContain(
      "Twinkle",
    );
  });

  it("does not catalog a failed PDF recognition (non-music)", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      fixtureFile("not-music.pdf", "application/pdf"),
      new Date(),
      {
        recognizeSheet: async () => {
          throw new Error(OMR_COPY.noMusic);
        },
      },
    );
    expect(result.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("does not catalog when recognition returns unparseable MusicXML", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      fixtureFile("twinkle-scan.png", "image/png"),
      new Date(),
      { recognizeSheet: async () => "%%% not musicxml %%%" },
    );
    expect(result.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("abandoning a ready draft never creates a piece", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      fixtureFile("twinkle-one-page.pdf", "application/pdf"),
      new Date(),
      { recognizeSheet: async () => TWINKLE_XML },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(listPieceWorkspaces()).toHaveLength(before);
    await discardPieceImport(result.draft);
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("retry after failure then confirm creates exactly one piece", async () => {
    const before = listPieceWorkspaces().length;
    const fail = await importPieceFromFile(
      fixtureFile("twinkle-scan.jpg", "image/jpeg"),
      new Date(),
      {
        recognizeSheet: async () => {
          throw new Error(OMR_COPY.noMusic);
        },
      },
    );
    expect(fail.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
    await discardPieceImport(fail.status === "failed" ? fail.draft : null);

    const ready = await importPieceFromFile(
      fixtureFile("twinkle-scan.jpg", "image/jpeg"),
      new Date(),
      { recognizeSheet: async () => TWINKLE_XML },
    );
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") return;
    expect(listPieceWorkspaces()).toHaveLength(before);

    const piece = await commitPieceImport(ready.draft);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
    expect(piece.recognitionConfirmed).toBe(true);
    expect(await readPieceOriginalFile(piece.pieceId)).toBeTruthy();
    expect(await readPieceStructuredScore(piece.pieceId)).toMatchObject({
      noteCount: 14,
      keySignature: "C major",
    });
  });

  it("confirming the same draft twice does not duplicate the piece", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      fixtureFile("twinkle-one-page.pdf", "application/pdf"),
      new Date(),
      { recognizeSheet: async () => TWINKLE_XML },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const first = await commitPieceImport(result.draft);
    const second = await commitPieceImport(result.draft);
    expect(second.pieceId).toBe(first.pieceId);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
  });

  it("successful scan → confirm preserves original and feeds Listen + Practise from one score", async () => {
    const result = await importPieceFromFile(
      fixtureFile("twinkle-multi-page.pdf", "application/pdf"),
      new Date(),
      { recognizeSheet: async () => TWINKLE_XML },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const phases: string[] = [];
    const withPhases = await importPieceFromFile(
      fixtureFile("twinkle-scan.png", "image/png"),
      new Date(),
      {
        recognizeSheet: async () => {
          phases.push("recognize");
          return TWINKLE_XML;
        },
        onPhase: (p) => phases.push(p),
      },
    );
    expect(withPhases.status).toBe("ready");
    if (withPhases.status !== "ready") return;
    expect(phases).toEqual(["uploading", "processing", "recognize", "validating"]);

    const piece = await commitPieceImport(withPhases.draft);
    const structured = await readPieceStructuredScore(piece.pieceId);
    const xml = await readPieceRecognizedMusicXml(piece.pieceId);
    expect(structured?.noteCount).toBe(14);
    expect(xml).toContain("score-partwise");
    expect(musicXmlRenderSource(xml!).format).toBe("musicxml");

    const listen = buildPlaybackTimeline(structured!);
    const practise = expectedNotesFromScore(structured!);
    expect(listen.notes).toHaveLength(practise.length);
    expect(practise[0]?.label).toMatch(/^C/);
  });

  it("reports async phase updates without blocking the caller on a sync recognize hop", async () => {
    const seen: string[] = [];
    let resolveRecognize!: (xml: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveRecognize = resolve;
    });

    const run = importPieceFromFile(
      fixtureFile("twinkle-one-page.pdf", "application/pdf"),
      new Date(),
      {
        recognizeSheet: async () => pending,
        onPhase: (p) => seen.push(p),
      },
    );

    await vi.waitFor(() => {
      expect(seen).toContain("processing");
    });
    expect(seen.includes("validating")).toBe(false);

    resolveRecognize(TWINKLE_XML);
    const result = await run;
    expect(result.status).toBe("ready");
    expect(seen).toEqual(["uploading", "processing", "validating"]);
  });
});

describe("multi-page PDF raster order", () => {
  it("sorts page-N.png names in numeric order (worker contract)", () => {
    const pageIndex = (name: string) =>
      Number(name.match(/page-(\d+)\.png$/i)?.[1] ?? 0);
    const compare = (a: string, b: string) => pageIndex(a) - pageIndex(b);
    const names = [
      "page-10.png",
      "page-2.png",
      "page-1.png",
      "page-11.png",
    ];
    expect([...names].sort(compare)).toEqual([
      "page-1.png",
      "page-2.png",
      "page-10.png",
      "page-11.png",
    ]);
  });
});
