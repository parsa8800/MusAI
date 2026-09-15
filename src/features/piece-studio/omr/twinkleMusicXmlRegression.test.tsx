/**
 * Regression: fixtures/piece-import/twinkle.musicxml through the full digital
 * import path — accept → parse → normalise → preview Ready → confirm.
 * Must keep working with the OMR worker completely disabled.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPieceCatalog,
  listPieceWorkspaces,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  readPieceRecognizedMusicXml,
  readPieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PieceImportReview } from "@/features/piece-studio/PieceImportReview";
import { PieceScorePaper } from "@/features/piece-studio/PieceScorePaper";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import {
  commitPieceImport,
  importPieceFromFile,
  PIECE_STUDIO_UPLOAD_ACCEPT,
} from "@/features/piece-studio/pieceStudioImport";
import { digitalScoreFromMusai, sourceKindFromFile } from "@/features/piece-studio/pieceStudioScore";
import { isMusicXmlInterchangeFile } from "@/features/piece-studio/score/musicXmlSource";
import {
  TWINKLE_FIXTURE,
  TWINKLE_XML,
} from "@/features/piece-studio/score/musicXmlFixtures";
import type { ScorePaintState } from "@/features/piece-studio/score/OsmdScoreAdapter";

const FIXTURES = path.join(process.cwd(), "fixtures/piece-import");
const FIXTURE_PATH = path.join(FIXTURES, "twinkle.musicxml");

const previewReceived = vi.hoisted(() => ({
  musicXml: null as string | null,
  title: null as string | null,
}));

vi.mock("@/features/piece-studio/score/OsmdScoreAdapter", () => ({
  OsmdScoreAdapter: ({
    title,
    musicXml,
    onPaintState,
  }: {
    title: string;
    musicXml: string;
    onPaintState?: (state: ScorePaintState) => void;
  }) => {
    previewReceived.musicXml = musicXml;
    previewReceived.title = title;
    useEffect(() => {
      onPaintState?.("preparing");
      onPaintState?.("ready");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="piece-osmd">{title}</div>;
  },
}));

function twinkleFixtureFile(): File {
  const buf = readFileSync(FIXTURE_PATH);
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new File([bytes], "twinkle.musicxml", { type: "" });
}

afterEach(() => {
  clearPieceCatalog();
  clearPieceFileMemory();
  previewReceived.musicXml = null;
  previewReceived.title = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Twinkle MusicXML fixture regression (OMR offline)", () => {
  it("disk fixture stays in sync with the in-memory Twinkle contract", () => {
    const disk = readFileSync(FIXTURE_PATH, "utf8");
    expect(disk).toContain("<work-title>Twinkle</work-title>");
    expect(disk).toContain('id="P1"');
    expect((disk.match(/<measure /g) ?? []).length).toBe(TWINKLE_FIXTURE.measures);
    // pitched notes only — rests are separate <rest/> elements
    const noteTags = disk.match(/<note>/g)?.length ?? 0;
    const restTags = disk.match(/<rest\/>/g)?.length ?? 0;
    expect(noteTags - restTags).toBe(TWINKLE_FIXTURE.notes);
    expect(restTags).toBe(TWINKLE_FIXTURE.rests);
    expect(TWINKLE_XML).toContain("<work-title>Twinkle</work-title>");
  });

  it("accepts the file, parses structure, paints Ready, and confirms one piece while OMR is down", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:8090 — OMR worker offline");
    });
    vi.stubGlobal("fetch", fetchMock);

    const recognizeSheet = vi.fn(async () => {
      throw new Error("OMR must not run for direct MusicXML");
    });

    const file = twinkleFixtureFile();

    // Accepted as a digital score (extension routing, not OMR).
    expect(PIECE_STUDIO_UPLOAD_ACCEPT).toContain(".musicxml");
    expect(isMusicXmlInterchangeFile(file.name, file.type)).toBe(true);
    expect(sourceKindFromFile(file.name, file.type)).toBe("musicxml");

    const before = listPieceWorkspaces().length;
    const result = await importPieceFromFile(file, new Date(), {
      recognizeSheet,
    });

    expect(recognizeSheet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const { draft } = result;
    expect(draft.sourceKind).toBe("musicxml");
    expect(draft.recognitionStatus).toBe("ready");
    expect(draft.musicXml).toContain("score-partwise");
    expect(draft.musicXml).toContain("Twinkle");
    expect(draft.structured).not.toBeNull();

    const structured = draft.structured!;
    // XML parsed → structure locked to the Twinkle fixture contract.
    expect(structured.parts).toHaveLength(TWINKLE_FIXTURE.parts);
    expect(structured.measureCount).toBe(TWINKLE_FIXTURE.measures);
    expect(structured.noteCount).toBe(TWINKLE_FIXTURE.notes);
    expect(structured.restCount).toBe(TWINKLE_FIXTURE.rests);
    expect(structured.parts[0]?.measures).toHaveLength(TWINKLE_FIXTURE.measures);

    // Normalised Piece Studio score created from the structured model.
    const normalised = digitalScoreFromMusai(structured);
    expect(normalised.hasStructuredScore).toBe(true);
    expect(normalised.title).toBe("Twinkle");
    expect(normalised.noteCount).toBe(TWINKLE_FIXTURE.notes);
    expect(normalised.measureCount).toBe(TWINKLE_FIXTURE.measures);
    expect(draft.title).toBe(normalised.title);

    // Still uncatalogued until confirm.
    expect(listPieceWorkspaces()).toHaveLength(before);

    const onConfirm = vi.fn();
    render(
      <PieceImportReview
        draft={draft}
        onConfirm={() => {
          void (async () => {
            const piece = await commitPieceImport(draft);
            expect(listPieceWorkspaces()).toHaveLength(before + 1);
            expect(piece.recognitionConfirmed).toBe(true);
            expect(piece.sourceKind).toBe("musicxml");
            expect(await readPieceRecognizedMusicXml(piece.pieceId)).toContain(
              "Twinkle",
            );
            const saved = await readPieceStructuredScore(piece.pieceId);
            expect(saved?.noteCount).toBe(TWINKLE_FIXTURE.notes);
            expect(saved?.measureCount).toBe(TWINKLE_FIXTURE.measures);
            expect(saved?.parts).toHaveLength(TWINKLE_FIXTURE.parts);
            onConfirm();
          })();
        }}
        onTryAgain={vi.fn()}
        onChooseAnotherFile={vi.fn()}
      />,
    );

    // Preview renderer received score data; review reaches Ready.
    expect(await screen.findByTestId("piece-import-review")).toHaveAttribute(
      "data-state",
      "ready",
    );
    expect(previewReceived.musicXml).toContain("score-partwise");
    expect(previewReceived.musicXml).toContain("Twinkle");
    expect(previewReceived.title).toBe("Twinkle");
    expect(screen.getByTestId("piece-osmd")).toHaveTextContent("Twinkle");
    expect(screen.getByTestId("piece-import-confirm")).toHaveTextContent(
      OMR_COPY.looksGood,
    );

    fireEvent.click(screen.getByTestId("piece-import-confirm"));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(listPieceWorkspaces()).toHaveLength(before + 1);

    // Second confirm on the same draft stays idempotent.
    const again = await commitPieceImport(draft);
    expect(listPieceWorkspaces()).toHaveLength(before + 1);
    expect(again.pieceId).toBe(draft.committedPieceId);

    // Workspace reload path: paper must receive the persisted MusicXML (not
    // the in-memory draft used during import review).
    const confirmedId = draft.committedPieceId!;
    const workspacePiece = listPieceWorkspaces().find((p) => p.pieceId === confirmedId);
    expect(workspacePiece).toBeTruthy();
    const paperXml = await readPieceRecognizedMusicXml(confirmedId);
    expect(paperXml).toContain("score-partwise");
    expect(paperXml).toContain("Twinkle");
    render(<PieceScorePaper piece={workspacePiece!} embedded />);
    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Twinkle");

    expect(recognizeSheet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
