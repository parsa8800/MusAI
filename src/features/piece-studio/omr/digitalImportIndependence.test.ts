/**
 * Direct MusicXML must stay independent of the OMR worker / Audiveris /
 * PDF rasterisation — even when /api/piece-omr is completely offline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPieceCatalog,
  listPieceWorkspaces,
} from "@/features/piece-studio/pieceStudioCatalog";
import { clearPieceFileMemory } from "@/features/piece-studio/pieceStudioFiles";
import { importDigitalScoreFromFile } from "@/features/piece-studio/pieceStudioDigitalImport";
import { importPieceFromFile } from "@/features/piece-studio/pieceStudioImport";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

const ROOT = path.join(process.cwd(), "src/features/piece-studio");
const FIXTURES = path.join(process.cwd(), "fixtures/piece-import");

function fixtureMusicXml(): File {
  const buf = readFileSync(path.join(FIXTURES, "twinkle.musicxml"));
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new File([bytes], "twinkle.musicxml", { type: "" });
}

afterEach(() => {
  clearPieceCatalog();
  clearPieceFileMemory();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("digital MusicXML path is independent of OMR", () => {
  it("pieceStudioDigitalImport never imports recognition / piece-omr clients", () => {
    const src = readFileSync(
      path.join(ROOT, "pieceStudioDigitalImport.ts"),
      "utf8",
    );
    const imports = src
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line) || /^\s*from\s+["']/.test(line))
      .join("\n");
    expect(imports).not.toMatch(/recognizeSheetMusic/);
    expect(imports).not.toMatch(/audiveris/i);
    expect(imports).not.toMatch(/rasterize/i);
    expect(imports).not.toMatch(/\/api\/piece-omr/);
    expect(imports).not.toMatch(/isSheetMusicScan/);
    expect(imports).not.toMatch(/validateRecognizedMusicXml/);
    expect(imports).not.toMatch(/omrProvider/);
    expect(src).toMatch(/validateMusicXmlInterchange/);
  });

  it("shared MusicXML validation lives outside the OMR runtime", () => {
    const src = readFileSync(path.join(ROOT, "score/validateMusicXml.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/features\/piece-studio\/omr\//);
    expect(src).not.toMatch(/recognizeSheetMusic/);
    expect(src).not.toMatch(/OmrError/);
  });

  it("importPieceFromFile routes MusicXML without calling /api/piece-omr", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:8090");
    });
    vi.stubGlobal("fetch", fetchMock);

    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(fixtureMusicXml());
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.sourceKind).toBe("musicxml");
    expect(result.draft.structured?.noteCount).toBe(14);
    expect(listPieceWorkspaces()).toHaveLength(before);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("importDigitalScoreFromFile works when fetch is broken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("OMR offline");
      }),
    );
    const result = await importDigitalScoreFromFile(
      new File([TWINKLE_XML], "twinkle.xml", { type: "" }),
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.draft.musicXml).toContain("score-partwise");
  });

  it("PDF path still uses recognition (convergence only after MusicXML exists)", async () => {
    const recognizeSheet = vi.fn(async () => TWINKLE_XML);
    const buf = readFileSync(path.join(FIXTURES, "twinkle-one-page.pdf"));
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    const result = await importPieceFromFile(
      new File([bytes], "twinkle-one-page.pdf", { type: "application/pdf" }),
      new Date(),
      { recognizeSheet },
    );
    expect(recognizeSheet).toHaveBeenCalledOnce();
    expect(result.status).toBe("ready");
  });
});
