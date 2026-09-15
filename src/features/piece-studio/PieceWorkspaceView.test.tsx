import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PieceWorkspaceView } from "@/features/piece-studio/PieceWorkspaceView";
import { clearPieceCatalog, upsertPieceWorkspace } from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  savePieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  useSearchParams: () => search,
}));

describe("PieceWorkspaceView", () => {
  beforeEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
    replace.mockClear();
    search = new URLSearchParams();
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
        measureCount: 8,
        hasStructuredScore: true,
        noteCount: 24,
        restCount: 2,
      },
      attempts: [],
      progressPercent: 0,
      hasOriginalFile: false,
    });
  });

  afterEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
  });

  it("opens a named workspace with Score, Listen, and Practise on one page", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.getByText("Pachelbel · D major · 4/4 · 80 bpm")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Score" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Listen" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Practise" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Piece studio/i }),
    ).toHaveAttribute("href", "/practice/piece");
  });

  it("keeps practise as a state of the same workspace", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Practise" }));
    expect(screen.getByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Practise" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Record" }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("piece-practise-support")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(
      "/practice/piece/canon-in-d?view=practise",
      { scroll: false },
    );
  });

  it("keeps the score visible with the last take so the student can try again", async () => {
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
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
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
          attemptId: "t1",
          recordedAt: "2026-01-02T15:04:00.000Z",
          attemptNumber: 1,
          durationSec: 8,
          score0to100: 90,
          notesHeard: 20,
          notesExpected: 24,
          inTunePercent: 85,
          averageAbsCents: 11,
          feedback: "Heard 20 of 24 notes. This take sat well in tune.",
          progressPercent: 90,
          hasRecording: false,
        },
      ],
      progressPercent: 90,
      personalBestScore: 90,
      hasOriginalFile: false,
    });
    search = new URLSearchParams("view=practise");
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(
      await screen.findByText((_, el) =>
        Boolean(
          el?.classList.contains("musai-piece-result__take") &&
            el.textContent?.replace(/\s+/g, " ").trim().startsWith("Take 1"),
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Best/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/Analyse/i)).not.toBeInTheDocument();
  });

  it("shows a sample review on Practise without treating it as real analysis", async () => {
    await savePieceStructuredScore(
      "canon",
      parseMusicXmlToScore(TWINKLE_XML, "Canon in D"),
    );
    search = new URLSearchParams("view=practise");
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByTestId("piece-practise-support")).toBeInTheDocument();
    expect(await screen.findByTestId("piece-feedback-preview")).toHaveAttribute(
      "data-mock",
      "true",
    );
    expect(screen.getByTestId("piece-focus-sample")).toHaveTextContent(
      /Sample · not from your take/i,
    );
    expect(screen.getByTestId("piece-focus-card")).toBeInTheDocument();
    expect(screen.getByText("What’s wrong")).toBeInTheDocument();
    expect(screen.getByText("A few notes are running sharp")).toBeInTheDocument();
    expect(screen.getByText("Try this")).toBeInTheDocument();
    expect(screen.getByTestId("coach-focus-show-on-score")).toHaveTextContent(
      /Show on score/i,
    );
    expect(screen.getByTestId("coach-chat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Rushing" })).toBeInTheDocument();
    expect(screen.queryByText("Also")).not.toBeInTheDocument();
    expect(screen.queryByText(/not_ready/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Practise" })).toBeInTheDocument();
  });

  it("does not open a missing piece as a blank workspace", async () => {
    render(<PieceWorkspaceView slug="not-a-piece" />);
    expect(await screen.findByText(/isn’t in your library/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Canon in D" })).not.toBeInTheDocument();
  });

  it("plays the digital score from Listen with the score still in view", async () => {
    await savePieceStructuredScore(
      "canon",
      parseMusicXmlToScore(TWINKLE_XML, "Canon in D"),
    );
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Listen" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart from beginning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Playback options" })).toBeInTheDocument();
    expect(screen.queryByTestId("piece-listen-options")).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /Tempo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
  });

  it("plays a score that was read from a PDF using the same Listen controls", async () => {
    upsertPieceWorkspace({
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      pieceId: "scan",
      slug: "etude",
      title: "Twinkle",
      composer: "Mozart",
      sourceKind: "pdf",
      sourceFileName: "Etude.pdf",
      sourceMimeType: "application/pdf",
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
      recognitionStatus: "ready",
    });
    await savePieceStructuredScore(
      "scan",
      parseMusicXmlToScore(TWINKLE_XML, "Twinkle"),
    );
    render(<PieceWorkspaceView slug="etude" />);
    expect(await screen.findByRole("heading", { name: "Twinkle" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Listen" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByText(/import musicxml/i)).not.toBeInTheDocument();
  });
});
