/**
 * Unified Piece Studio import safety — same dropzone accept list, automatic
 * routing, preview-before-commit, and no duplicate catalog rows.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { zipSync, strToU8 } from "fflate";
import { PieceImportDropzone } from "@/features/piece-studio/PieceImportDropzone";
import {
  clearPieceCatalog,
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
  discardPieceImport,
  importPieceFromFile,
  PIECE_STUDIO_UPLOAD_ACCEPT,
} from "@/features/piece-studio/pieceStudioImport";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { isSheetMusicScan } from "@/features/piece-studio/omr/sheetMusicScan";
import { sourceKindFromFile } from "@/features/piece-studio/pieceStudioScore";
import { isMusicXmlInterchangeFile } from "@/features/piece-studio/score/musicXmlSource";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";

const FIXTURES = path.join(process.cwd(), "fixtures/piece-import");

function fixtureFile(name: string, mime = ""): File {
  const buf = readFileSync(path.join(FIXTURES, name));
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new File([bytes], name, { type: mime });
}

function mxlFromXml(xml: string, name = "Twinkle.mxl"): File {
  const packed = zipSync({
    "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container><rootfiles>
  <rootfile full-path="score.musicxml"/>
</rootfiles></container>`),
    "score.musicxml": strToU8(xml),
  });
  return new File([packed], name, { type: "" });
}

function existingPiece(partial: Partial<PieceWorkspaceV1> = {}): PieceWorkspaceV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    pieceId: "existing-1",
    slug: "canon-in-d",
    title: "Canon in D",
    composer: "Pachelbel",
    sourceKind: "musicxml",
    sourceFileName: "Canon in D.musicxml",
    sourceMimeType: "application/xml",
    importedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-02T00:00:00.000Z",
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
      noteCount: 40,
      restCount: 2,
    },
    attempts: [],
    progressPercent: 25,
    personalBestScore: 88,
    lifetimeAttemptCount: 3,
    lastPractisedAt: "2026-01-02T00:00:00.000Z",
    hasOriginalFile: true,
    recognitionStatus: "none",
    recognitionMessage: null,
    recognitionConfirmed: true,
    recognitionHints: [],
    recognitionFocusMeasure: null,
    ...partial,
  };
}

afterEach(() => {
  clearPieceCatalog();
  clearPieceFileMemory();
});

describe("automatic file routing (never ask the user)", () => {
  it.each([
    ["twinkle.musicxml", "", "musicxml", false],
    ["score.xml", "", "musicxml", false],
    ["tune.mxl", "", "musicxml", false],
    ["page.pdf", "application/pdf", "pdf", true],
    ["page.png", "image/png", "image", true],
    ["page.jpg", "image/jpeg", "image", true],
    ["page.jpeg", "image/jpeg", "image", true],
  ] as const)(
    "%s → kind=%s, omrScan=%s",
    (name, mime, kind, omrScan) => {
      expect(sourceKindFromFile(name, mime)).toBe(kind);
      expect(isMusicXmlInterchangeFile(name, mime)).toBe(kind === "musicxml");
      expect(isSheetMusicScan(name, mime)).toBe(omrScan);
    },
  );

  it("routes MusicXML away from OMR even when MIME looks like a PDF", async () => {
    const recognizeSheet = vi.fn(async () => {
      throw new Error("OMR must not run");
    });
    const result = await importPieceFromFile(
      new File([TWINKLE_XML], "twinkle.musicxml", { type: "application/pdf" }),
      new Date(),
      { recognizeSheet },
    );
    expect(recognizeSheet).not.toHaveBeenCalled();
    expect(result.status).toBe("ready");
  });

  it("unified accept list covers every Piece Studio format", () => {
    for (const ext of [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".musicxml",
      ".xml",
      ".mxl",
    ]) {
      expect(PIECE_STUDIO_UPLOAD_ACCEPT).toContain(ext);
    }
  });
});

describe("unified dropzone → importPieceFromFile", () => {
  it("one visible uploader forwards any supported file without a format picker", async () => {
    const seen: File[] = [];
    render(
      <PieceImportDropzone
        onFile={(file) => {
          seen.push(file);
        }}
      />,
    );
    expect(screen.queryByText(/digital score/i)).toBeInTheDocument(); // format hint only
    expect(screen.queryByText(/choose file/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upload sheet/i)).not.toBeInTheDocument();

    const input = screen.getByLabelText(OMR_COPY.importMusic);
    const files = [
      fixtureFile("twinkle.musicxml", ""),
      new File([TWINKLE_XML], "melody.xml", { type: "" }),
      mxlFromXml(TWINKLE_XML),
      fixtureFile("twinkle-one-page.pdf", "application/pdf"),
      fixtureFile("twinkle-scan.png", "image/png"),
      fixtureFile("twinkle-scan.jpg", "image/jpeg"),
    ];
    for (const file of files) {
      fireEvent.change(input, { target: { files: [file] } });
    }
    expect(seen).toHaveLength(files.length);
    expect(seen.map((f) => f.name)).toEqual(files.map((f) => f.name));
  });
});

describe("MusicXML / XML / MXL without OMR worker", () => {
  it.each([
    ["fixture .musicxml", () => fixtureFile("twinkle.musicxml", "")],
    ["plain .xml", () => new File([TWINKLE_XML], "twinkle.xml", { type: "" })],
    ["compressed .mxl", () => mxlFromXml(TWINKLE_XML)],
  ] as const)("%s: ready preview, no catalog until confirm", async (_label, makeFile) => {
    const recognizeSheet = vi.fn(async () => {
      throw new Error("OMR worker offline — must not be called");
    });
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(makeFile(), new Date(), {
      recognizeSheet,
    });
    expect(recognizeSheet).not.toHaveBeenCalled();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(listPieceWorkspaces()).toHaveLength(before);
    expect(result.draft.musicXml).toContain("score-partwise");
    expect(result.draft.structured?.noteCount).toBe(14);
    // Preview payload exists before permanent creation.
    expect(result.draft.recognitionStatus).toBe("ready");

    const piece = await commitPieceImport(result.draft);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
    expect(piece.recognitionConfirmed).toBe(true);
    expect(await readPieceRecognizedMusicXml(piece.pieceId)).toContain("Twinkle");
    expect((await readPieceStructuredScore(piece.pieceId))?.noteCount).toBe(14);
    expect(await readPieceOriginalFile(piece.pieceId)).toBeTruthy();
  });
});

describe("PDF / PNG / JPG use OMR then converge on the same review path", () => {
  it.each([
    ["twinkle-one-page.pdf", "application/pdf", "pdf"],
    ["twinkle-scan.png", "image/png", "image"],
    ["twinkle-scan.jpg", "image/jpeg", "image"],
  ] as const)("%s calls recognizeSheet and stays uncatalogued until confirm", async (name, mime, kind) => {
    const recognizeSheet = vi.fn(async () => TWINKLE_XML);
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(fixtureFile(name, mime), new Date(), {
      recognizeSheet,
    });
    expect(recognizeSheet).toHaveBeenCalledOnce();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.sourceKind).toBe(kind);
    expect(listPieceWorkspaces()).toHaveLength(before);
    expect(result.draft.musicXml).toContain("score-partwise");
    expect(result.draft.structured?.noteCount).toBe(14);

    const piece = await commitPieceImport(result.draft);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
    expect(piece.sourceKind).toBe(kind);
  });
});

describe("failed imports never create library entries", () => {
  it("invalid MusicXML stays out of the catalog", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      new File(["not a score"], "broken.musicxml", { type: "" }),
    );
    expect(result.status).toBe("failed");
    expect(listPieceWorkspaces()).toHaveLength(before);
  });

  it("non-music PDF stays out of the catalog", async () => {
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

  it("unsupported extension does not invent a piece", async () => {
    const before = listPieceWorkspaces().length;
    await expect(
      importPieceFromFile(new File(["hello"], "notes.txt", { type: "text/plain" })),
    ).rejects.toThrow();
    expect(listPieceWorkspaces()).toHaveLength(before);
  });
});

describe("confirm / retry lifecycle", () => {
  it("successful confirm creates exactly one entry; second confirm is idempotent", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(
      fixtureFile("twinkle.musicxml", ""),
      new Date(),
      {
        recognizeSheet: async () => {
          throw new Error("OMR offline");
        },
      },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const first = await commitPieceImport(result.draft);
    const second = await commitPieceImport(result.draft);
    expect(first.pieceId).toBe(second.pieceId);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
  });

  it("retry after failure then confirm creates exactly one entry", async () => {
    const before = listPieceWorkspaces().length;
    const fail = await importPieceFromFile(
      fixtureFile("twinkle-scan.png", "image/png"),
      new Date(),
      {
        recognizeSheet: async () => {
          throw new Error(OMR_COPY.noMusic);
        },
      },
    );
    expect(fail.status).toBe("failed");
    await discardPieceImport(fail.status === "failed" ? fail.draft : null);
    expect(listPieceWorkspaces()).toHaveLength(before);

    const ready = await importPieceFromFile(
      fixtureFile("twinkle-scan.png", "image/png"),
      new Date(),
      { recognizeSheet: async () => TWINKLE_XML },
    );
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") return;
    await commitPieceImport(ready.draft);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
  });

  it("abandoning a ready draft never catalogs the piece", async () => {
    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(fixtureFile("twinkle.musicxml", ""));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    await discardPieceImport(result.draft);
    expect(listPieceWorkspaces()).toHaveLength(before);
  });
});

describe("existing library pieces stay intact", () => {
  it("importing another piece does not disturb an already-confirmed workspace", async () => {
    upsertPieceWorkspace(existingPiece());
    expect(listPieceWorkspaces()).toHaveLength(1);
    expect(listPieceWorkspaces()[0]?.slug).toBe("canon-in-d");
    expect(listPieceWorkspaces()[0]?.progressPercent).toBe(25);

    const result = await importPieceFromFile(fixtureFile("twinkle.musicxml", ""));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const piece = await commitPieceImport(result.draft);

    const listed = listPieceWorkspaces();
    expect(listed).toHaveLength(2);
    const prior = listed.find((p) => p.slug === "canon-in-d");
    expect(prior?.progressPercent).toBe(25);
    expect(prior?.personalBestScore).toBe(88);
    expect(prior?.lifetimeAttemptCount).toBe(3);
    expect(piece.slug).not.toBe("canon-in-d");
  });
});
