import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PieceWorkspaceView } from "@/features/piece-studio/PieceWorkspaceView";
import { clearPieceCatalog, upsertPieceWorkspace } from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  savePieceRecognizedMusicXml,
  savePieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { clearCoachMemory } from "@/lib/coachThreadMemory";

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
    clearCoachMemory();
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
    clearCoachMemory();
  });

  it("opens a named workspace with Score and Practise on one page", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.queryByText(/Pachelbel · D major · 4\/4 · 80 bpm/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Score" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Listen" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Practise" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Piece studio/i }),
    ).toHaveAttribute("href", "/practice/piece");
  });

  it("keeps playback and PDF on the score page, not under the mode tabs", async () => {
    await savePieceRecognizedMusicXml("canon", TWINKLE_XML);
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    const pdf = await screen.findByRole("button", { name: "View PDF" });
    expect(pdf.closest(".musai-piece-workspace__nav")).toBeTruthy();
    expect(pdf.closest(".musai-piece-workspace__modes")).toBeNull();
    expect(pdf.closest(".musai-piece-score-viewer")).toBeNull();
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByTestId("piece-score-tools")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Score" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps the Score/Practise tablist the same fixed control across views", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();

    const tablist = screen.getByRole("tablist", { name: "Piece workspace" });
    expect(tablist).toHaveClass("musai-piece-workspace__tabs");
    expect(tablist).toHaveClass("musai-segmented");
    expect(tablist).toHaveClass("musai-segmented--compact");
    const classOnScore = tablist.className;

    fireEvent.click(screen.getByRole("tab", { name: "Practise" }));
    expect(screen.getByRole("tab", { name: "Practise" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tablist", { name: "Piece workspace" }).className).toBe(
      classOnScore,
    );
  });

  it("keeps practise as a state of the same workspace", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Practise" }));
    expect(screen.getByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Practise" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Record" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open coach/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tips" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open coach/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeEnabled();
    });
    expect(screen.getByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(
      "/practice/piece/canon-in-d?view=practise",
      { scroll: false },
    );
  });

  it("keeps the coach thread across Score and Practise", async () => {
    const view = render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open coach/i }));
    fireEvent.click(await screen.findByRole("button", { name: "What key is this?" }));
    expect(await screen.findByText(/D major/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "How fast is it?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Practise" }));
    expect(await screen.findByText(/D major/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Where should I start?" }),
    ).toBeInTheDocument();

    view.unmount();
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByText(/D major/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close coach/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What key is this?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How fast is it?" })).toBeInTheDocument();
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
    expect(screen.queryByText(/^Take 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/Analyse/i)).not.toBeInTheDocument();
  });

  it("lets the student chat about the piece on Score and Practise without recording", async () => {
    await savePieceStructuredScore(
      "canon",
      parseMusicXmlToScore(TWINKLE_XML, "Canon in D"),
    );
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /open coach/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Practise" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask your coach/i)).toBeEnabled();
    });
    expect(screen.queryByRole("heading", { name: "Tips" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-feedback-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-pitch-map")).not.toBeInTheDocument();
    expect(screen.queryByText(/colour on the score/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hear this/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "Practise" })).toBeInTheDocument();
  });

  it("does not open a missing piece as a blank workspace", async () => {
    render(<PieceWorkspaceView slug="not-a-piece" />);
    expect(await screen.findByText(/isn’t in your library/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Canon in D" })).not.toBeInTheDocument();
  });

  it("plays the digital score on the score page with the music still in view", async () => {
    await savePieceStructuredScore(
      "canon",
      parseMusicXmlToScore(TWINKLE_XML, "Canon in D"),
    );
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Score" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart from beginning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Playback options" })).toBeInTheDocument();
    expect(screen.queryByTestId("piece-listen-options")).not.toBeInTheDocument();
    expect(screen.getByTestId("piece-listen-clock")).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /Tempo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
  });

  it("shows a full-page opening shell until the score is ready", async () => {
    let release!: (score: ReturnType<typeof parseMusicXmlToScore>) => void;
    const deferred = new Promise<ReturnType<typeof parseMusicXmlToScore>>((resolve) => {
      release = resolve;
    });
    const files = await import("@/features/piece-studio/pieceStudioFiles");
    const spy = vi
      .spyOn(files, "readPieceStructuredScore")
      .mockImplementation(() => deferred);

    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByTestId("piece-workspace-opening")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Piece studio/i })).toBeInTheDocument();
    expect(screen.queryByText(/Getting your score ready/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Canon in D" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Listen" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-listen-transport")).not.toBeInTheDocument();

    release(parseMusicXmlToScore(TWINKLE_XML, "Canon in D"));
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.queryByTestId("piece-workspace-opening")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("plays a score that was read from a PDF on the score page", async () => {
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
      recognitionConfirmed: true,
    });
    await savePieceStructuredScore(
      "scan",
      parseMusicXmlToScore(TWINKLE_XML, "Twinkle"),
    );
    render(<PieceWorkspaceView slug="etude" />);
    expect(await screen.findByRole("heading", { name: "Twinkle" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByText(/import musicxml/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/once the page can be read/i)).not.toBeInTheDocument();
  });

  it("does not tell a confirmed PDF piece that the page still needs reading when playback is empty", async () => {
    upsertPieceWorkspace({
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      pieceId: "empty-scan",
      slug: "empty-scan",
      title: "Blank page",
      composer: null,
      sourceKind: "pdf",
      sourceFileName: "blank.pdf",
      sourceMimeType: "application/pdf",
      importedAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      lastView: "listen",
      score: {
        schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
        format: "musicxml",
        title: "Blank page",
        composer: null,
        keySignature: null,
        timeSignature: null,
        tempoBpm: null,
        measureCount: 0,
        hasStructuredScore: false,
        noteCount: 0,
        restCount: 0,
      },
      attempts: [],
      progressPercent: 0,
      hasOriginalFile: true,
      recognitionStatus: "ready",
      recognitionConfirmed: true,
    });
    search = new URLSearchParams("view=listen");
    render(<PieceWorkspaceView slug="empty-scan" />);
    expect(await screen.findByRole("heading", { name: "Blank page" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Score" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Listen" })).not.toBeInTheDocument();
    expect(
      await screen.findByText(/doesn’t have timing to play yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/once the page can be read/i)).not.toBeInTheDocument();
  });
});
