import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPieceCatalog } from "@/features/piece-studio/pieceStudioCatalog";
import { PieceScorePaper } from "@/features/piece-studio/PieceScorePaper";
import {
  clearPieceFileMemory,
  savePieceOriginalFile,
  savePieceRecognizedMusicXml,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

const adapterProps: { current: Record<string, unknown> } = { current: {} };

vi.mock("@/features/piece-studio/score/OsmdScoreAdapter", () => ({
  OsmdScoreAdapter: (props: Record<string, unknown>) => {
    adapterProps.current = props;
    return <div data-testid="piece-osmd">{String(props.title ?? "")}</div>;
  },
  usePieceScoreToolsSlot: () => null,
  PIECE_SCORE_ORIGINAL_SLOT_ID: "musai-piece-original-slot",
}));

function piece(partial: Partial<PieceWorkspaceV1> = {}): PieceWorkspaceV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    pieceId: "twinkle",
    slug: "twinkle",
    title: "Twinkle",
    composer: "Mozart",
    sourceKind: "musicxml",
    sourceFileName: "Twinkle.musicxml",
    sourceMimeType: "application/xml",
    importedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    lastView: "score",
    score: {
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      format: "musicxml",
      title: "Twinkle",
      composer: "Mozart",
      keySignature: "C major",
      timeSignature: "4/4",
      tempoBpm: 100,
      measureCount: 4,
      hasStructuredScore: true,
      noteCount: 14,
      restCount: 2,
    },
    attempts: [],
    progressPercent: 0,
    hasOriginalFile: true,
    ...partial,
  };
}

describe("PieceScorePaper", () => {
  afterEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
  });

  it("renders MusicXML through the OSMD adapter, not empty staves", async () => {
    await savePieceOriginalFile(
      "twinkle",
      new Blob([TWINKLE_XML], { type: "application/xml" }),
    );
    render(<PieceScorePaper piece={piece()} />);
    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Twinkle");
    expect(screen.queryByText(/Mozart · C major · 4\/4 · 100 bpm/i)).not.toBeInTheDocument();
  });

  it("loads recognized MusicXML for an embedded workspace piece", async () => {
    await savePieceRecognizedMusicXml("twinkle", TWINKLE_XML);
    render(<PieceScorePaper piece={piece()} embedded />);
    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Twinkle");
    expect(screen.queryByRole("heading", { name: "Twinkle" })).not.toBeInTheDocument();
  });

  it("after confirm import, workspace paper receives saved MusicXML", async () => {
    const { commitPieceImport, importPieceFromFile } = await import(
      "@/features/piece-studio/pieceStudioImport"
    );
    const { clearPieceCatalog } = await import(
      "@/features/piece-studio/pieceStudioCatalog"
    );
    clearPieceCatalog();
    const file = new File([TWINKLE_XML], "twinkle.musicxml", {
      type: "application/xml",
    });
    const result = await importPieceFromFile(file);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const confirmed = await commitPieceImport(result.draft);
    render(<PieceScorePaper piece={confirmed} embedded />);
    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Twinkle");
  });

  it("does not load OSMD when the original MusicXML is missing", async () => {
    render(<PieceScorePaper piece={piece({ hasOriginalFile: false })} />);
    await waitFor(() => {
      expect(screen.queryByTestId("piece-osmd")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Twinkle" })).toBeInTheDocument();
  });

  it("shows a reconstructed digital score from a photo so it can be checked", async () => {
    await savePieceOriginalFile(
      "scan",
      new Blob(["png"], { type: "image/png" }),
    );
    await savePieceRecognizedMusicXml("scan", TWINKLE_XML);
    render(
      <PieceScorePaper
        piece={piece({
          pieceId: "scan",
          sourceKind: "image",
          sourceFileName: "page.png",
          sourceMimeType: "image/png",
          recognitionStatus: "ready",
          recognitionConfirmed: false,
        })}
      />,
    );
    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Twinkle");
    expect(screen.getByText("Check your score")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Digital score" })).not.toBeInTheDocument();
  });

  it("defaults a confirmed PDF piece to the digital score, not the original page", async () => {
    await savePieceOriginalFile(
      "scan-pdf",
      new Blob(["%PDF"], { type: "application/pdf" }),
    );
    await savePieceRecognizedMusicXml("scan-pdf", TWINKLE_XML);
    render(
      <PieceScorePaper
        piece={piece({
          pieceId: "scan-pdf",
          sourceKind: "pdf",
          sourceFileName: "page.pdf",
          sourceMimeType: "application/pdf",
          recognitionStatus: "ready",
          recognitionConfirmed: true,
        })}
        embedded
      />,
    );
    expect(await screen.findByTestId("piece-osmd")).toHaveTextContent("Twinkle");
    expect(screen.queryByLabelText(/Twinkle score/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Digital score" })).not.toBeInTheDocument();
  });

  it("arms the shared playhead in Practise without dropping feedback highlights", async () => {
    await savePieceRecognizedMusicXml("twinkle", TWINKLE_XML);
    const highlight = {
      id: "issue-1",
      startWholeNotes: 0,
      endWholeNotes: 1,
      label: "First phrase",
      emphasis: "focus" as const,
    };
    render(
      <PieceScorePaper
        piece={piece()}
        embedded
        followPlayback={false}
        showPlayhead
        highlight={highlight}
        highlights={[highlight]}
      />,
    );
    expect(await screen.findByTestId("piece-osmd")).toBeInTheDocument();
    expect(adapterProps.current.followPlayback).toBe(false);
    expect(adapterProps.current.showPlayhead).toBe(true);
    expect(adapterProps.current.highlight).toEqual(
      expect.objectContaining({ id: "issue-1" }),
    );
    expect(adapterProps.current.highlights).toEqual([
      expect.objectContaining({ id: "issue-1" }),
    ]);
  });

  it("keeps Listen follow mode from painting practise highlights", async () => {
    await savePieceRecognizedMusicXml("twinkle", TWINKLE_XML);
    render(
      <PieceScorePaper
        piece={piece()}
        embedded
        followPlayback
        showPlayhead
        highlight={{
          id: "issue-1",
          startWholeNotes: 0,
          endWholeNotes: 1,
          label: "First phrase",
        }}
      />,
    );
    expect(await screen.findByTestId("piece-osmd")).toBeInTheDocument();
    expect(adapterProps.current.followPlayback).toBe(true);
    expect(adapterProps.current.showPlayhead).toBe(true);
    expect(adapterProps.current.highlight).toBeNull();
  });
});
