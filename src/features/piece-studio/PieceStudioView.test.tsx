import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PieceStudioView } from "@/features/piece-studio/PieceStudioView";
import { clearPieceCatalog, upsertPieceWorkspace } from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  savePieceOriginalFile,
  savePieceRecognizedMusicXml,
  savePieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { OMR_COPY } from "@/features/piece-studio/omr/omrProvider";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn(), replace: vi.fn() }),
}));

describe("PieceStudioView", () => {
  beforeEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
    push.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ available: true }),
      }),
    );
  });

  it("offers one unified import dropzone for all score formats", async () => {
    render(<PieceStudioView />);
    expect(
      screen.getByRole("heading", { name: "Piece studio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Open a score, listen, then practise."),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("piece-library-empty")).toHaveTextContent(
      /Your pieces will show up here/i,
    );
    expect(screen.queryByText(/isn’t connected/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your pieces" })).not.toBeInTheDocument();
    expect(screen.queryByText(/no pieces yet/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-import-dropzone")).toBeInTheDocument();
    expect(screen.getByTestId("piece-import-dropzone")).not.toHaveAttribute(
      "data-compact",
    );
    expect(screen.getByText(OMR_COPY.dropMusic)).toBeInTheDocument();
    expect(screen.getByText(OMR_COPY.dropFormats)).toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.uploadSheet)).not.toBeInTheDocument();
    expect(screen.queryByText(OMR_COPY.advancedDigital)).not.toBeInTheDocument();
    expect(screen.queryByText(/choose file/i)).not.toBeInTheDocument();
    const upload = screen.getByLabelText(OMR_COPY.importMusic);
    expect(upload).toHaveAttribute("type", "file");
    const accept = upload.getAttribute("accept") ?? "";
    expect(accept).toContain(".pdf");
    expect(accept).toContain(".png");
    expect(accept).toContain(".jpg");
    expect(accept).toContain(".jpeg");
    expect(accept).toContain(".musicxml");
    expect(accept).toContain(".xml");
    expect(accept).toContain(".mxl");
    expect(screen.queryByText(/MusicXML/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/npm /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/omr-worker/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/MUSAI_/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Scale studio" })).not.toBeInTheDocument();
  });

  it("shows a scanning hint when photos/PDFs are offline but keeps the dropzone usable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ available: false, message: "internal worker detail" }),
      }),
    );
    render(<PieceStudioView />);
    expect(
      await screen.findByText(OMR_COPY.scanningUnavailable),
    ).toBeInTheDocument();
    expect(OMR_COPY.scanningUnavailable).toMatch(/digital scores still work/i);
    expect(screen.queryByText(/npm /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/omr-worker/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal worker detail/i)).not.toBeInTheDocument();
    expect(screen.getByText(OMR_COPY.dropMusic)).toBeInTheDocument();
    const upload = screen.getByLabelText(OMR_COPY.importMusic);
    expect(upload).not.toBeDisabled();
  });

  it("lists imported pieces so they can be continued", async () => {
    upsertPieceWorkspace({
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      pieceId: "canon",
      slug: "canon-in-d",
      title: "Canon in D",
      composer: "Pachelbel",
      sourceKind: "musicxml",
      sourceFileName: "Canon in D.musicxml",
      sourceMimeType: "application/xml",
      importedAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-02T00:00:00.000Z",
      lastView: "practise",
      score: {
        schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
        format: "musicxml",
        title: "Canon in D",
        composer: "Pachelbel",
        keySignature: "D major",
        timeSignature: "4/4",
        tempoBpm: 80,
        measureCount: 8,
        hasStructuredScore: true,
        noteCount: 24,
        restCount: 2,
      },
      attempts: [
        {
          attemptId: "a1",
          recordedAt: "2026-01-02T10:00:00.000Z",
          attemptNumber: 1,
          durationSec: 20,
          score0to100: 82,
          notesHeard: 20,
          notesExpected: 24,
          inTunePercent: 80,
          averageAbsCents: 14,
          feedback: "Try again when you’re ready.",
          progressPercent: 82,
          hasRecording: false,
        },
        {
          attemptId: "a2",
          recordedAt: "2026-01-02T11:00:00.000Z",
          attemptNumber: 2,
          durationSec: 22,
          score0to100: 76,
          notesHeard: 18,
          notesExpected: 24,
          inTunePercent: 70,
          averageAbsCents: 18,
          feedback: "Try again when you’re ready.",
          progressPercent: 76,
          hasRecording: false,
        },
      ],
      progressPercent: 82,
      personalBestScore: 82,
      lifetimeAttemptCount: 2,
      lastPractisedAt: "2026-01-02T11:00:00.000Z",
      hasOriginalFile: true,
      recognitionConfirmed: true,
    });
    render(<PieceStudioView />);
    expect(await screen.findByText("Canon in D")).toBeInTheDocument();
    expect(screen.getByText("Pachelbel")).toBeInTheDocument();
    expect(screen.getByText("Best 82%")).toBeInTheDocument();
    expect(screen.queryByText(/2 attempts/)).not.toBeInTheDocument();
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open Canon in D/i }),
    ).toHaveAttribute("href", "/practice/piece/canon-in-d");
    expect(screen.getByRole("heading", { name: "Your pieces" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /More actions for Canon in D/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("piece-import-dropzone")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(screen.queryByTestId("piece-library-empty")).not.toBeInTheDocument();
  });

  it("removes a piece only after confirmation", async () => {
    upsertPieceWorkspace({
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      pieceId: "canon",
      slug: "canon-in-d",
      title: "Canon in D",
      composer: "Pachelbel",
      sourceKind: "musicxml",
      sourceFileName: "Canon.musicxml",
      sourceMimeType: "application/xml",
      importedAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-02T00:00:00.000Z",
      lastView: "practise",
      score: {
        schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
        format: "musicxml",
        title: "Canon in D",
        composer: "Pachelbel",
        keySignature: "D major",
        timeSignature: "4/4",
        tempoBpm: 80,
        measureCount: 8,
        hasStructuredScore: true,
        noteCount: 24,
        restCount: 0,
      },
      attempts: [],
      progressPercent: 0,
      hasOriginalFile: true,
      recognitionConfirmed: true,
    });
    render(<PieceStudioView />);
    expect(await screen.findByText("Canon in D")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /More actions for Canon in D/i }),
    );
    fireEvent.click(screen.getByTestId("piece-remove-menu-item"));
    expect(screen.getByTestId("piece-remove-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Remove “Canon in D”\?/)).toBeInTheDocument();
    expect(
      screen.getByText(/remove the piece and its saved practice progress/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("piece-remove-dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Canon in D")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /More actions for Canon in D/i }),
    );
    fireEvent.click(screen.getByTestId("piece-remove-menu-item"));
    fireEvent.click(screen.getByTestId("piece-remove-confirm"));

    await waitFor(() => {
      expect(screen.queryByText("Canon in D")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("piece-remove-dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your pieces" })).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-library-empty")).toBeInTheDocument();
  });

  it("reopens the check step for an unconfirmed page scan", async () => {
    upsertPieceWorkspace({
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      pieceId: "scan",
      slug: "etude",
      title: "Etude",
      composer: null,
      sourceKind: "pdf",
      sourceFileName: "Etude.pdf",
      sourceMimeType: "application/pdf",
      importedAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      lastView: "score",
      score: {
        schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
        format: "musicxml",
        title: "Etude",
        composer: null,
        keySignature: null,
        timeSignature: "4/4",
        tempoBpm: null,
        measureCount: 4,
        hasStructuredScore: true,
        noteCount: 12,
        restCount: 0,
      },
      attempts: [],
      progressPercent: 0,
      hasOriginalFile: true,
      recognitionStatus: "ready",
      recognitionConfirmed: false,
      recognitionHints: ["Quickly scan a few bars against your page before practising."],
    });
    await savePieceOriginalFile(
      "scan",
      new File(["%PDF-1.4"], "Etude.pdf", { type: "application/pdf" }),
    );
    await savePieceRecognizedMusicXml("scan", TWINKLE_XML);
    await savePieceStructuredScore(
      "scan",
      parseMusicXmlToScore(TWINKLE_XML, "Etude"),
    );
    render(<PieceStudioView />);
    expect(await screen.findByText("Etude")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.queryByText("Check")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Review Etude/i }));
    await waitFor(() => {
      expect(screen.getByTestId("piece-import-review")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Etude" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
