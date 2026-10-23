import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PieceWorkspaceView } from "@/features/piece-studio/PieceWorkspaceView";
import { clearPieceCatalog, upsertPieceWorkspace, getPieceWorkspaceById } from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  savePieceRecognizedMusicXml,
  savePieceStructuredScore,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";
import { clearCoachMemory } from "@/lib/coachThreadMemory";
import {
  PIECE_FEEDBACK_CATEGORIES,
  PIECE_FEEDBACK_SCHEMA_VERSION,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import { appendPieceAttempt } from "@/features/piece-studio/practice/piecePracticeAttempts";

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

  it("opens a named workspace as one practise page", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.queryByText(/Pachelbel · D major · 4\/4 · 80 bpm/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Listen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Practise" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Piece studio/i }),
    ).toHaveAttribute("href", "/practice/piece");
  });

  it("keeps PDF beside the piece title and Teacher in the header", async () => {
    await savePieceRecognizedMusicXml("canon", TWINKLE_XML);
    render(<PieceWorkspaceView slug="canon-in-d" />);
    const title = await screen.findByRole("heading", { name: "Canon in D" });
    const pdf = await screen.findByRole("button", { name: "View PDF" });
    const teacher = screen.getByRole("button", { name: /^teacher$/i });
    expect(pdf.closest(".musai-piece-workspace__identity-copy")).toBeTruthy();
    expect(title.closest(".musai-piece-workspace__identity-copy")).toBeTruthy();
    expect(pdf.closest(".musai-piece-workspace__nav")).toBeNull();
    expect(teacher.closest(".musai-piece-workspace__nav")).toBeTruthy();
    expect(pdf.closest(".musai-piece-workspace__modes")).toBeNull();
    expect(pdf.closest(".musai-piece-score-viewer")).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Record" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("piece-score-tools")).not.toBeInTheDocument();
  });

  it("opens the piece as one practise workspace without Score tabs", async () => {
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Piece workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Score" })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Record" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    const teacher = screen.getByRole("button", { name: /^teacher$/i });
    expect(teacher.closest(".musai-piece-workspace__nav")).toBeTruthy();
    fireEvent.click(teacher);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask your teacher/i)).toBeEnabled();
    });
    expect(screen.queryByRole("button", { name: /^teacher$/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ask your coach/i)).not.toBeInTheDocument();
  });

  it("keeps the teacher thread when the piece workspace remounts", async () => {
    const view = render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^teacher$/i }));
    const ask = await screen.findByPlaceholderText(/Ask your teacher/i);
    fireEvent.change(ask, { target: { value: "What key is this?" } });
    fireEvent.submit(ask.closest("form")!);
    expect(await screen.findByText(/D major/i)).toBeInTheDocument();

    view.unmount();
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByText(/D major/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /hide teacher/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "What key is this?" })).not.toBeInTheDocument();
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

  it("lets the student chat about the piece without recording", async () => {
    await savePieceStructuredScore(
      "canon",
      parseMusicXmlToScore(TWINKLE_XML, "Canon in D"),
    );
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^teacher$/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask your teacher/i)).toBeEnabled();
    });
    expect(screen.queryByPlaceholderText(/Ask your coach/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tips" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-feedback-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-pitch-map")).not.toBeInTheDocument();
    expect(screen.queryByText(/colour on the score/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hear this/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Score" })).not.toBeInTheDocument();
  });

  it("does not open a missing piece as a blank workspace", async () => {
    render(<PieceWorkspaceView slug="not-a-piece" />);
    expect(await screen.findByText(/isn’t in your library/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Canon in D" })).not.toBeInTheDocument();
  });

  it("keeps the engraved score and record dock on one practise page", async () => {
    await savePieceStructuredScore(
      "canon",
      parseMusicXmlToScore(TWINKLE_XML, "Canon in D"),
    );
    render(<PieceWorkspaceView slug="canon-in-d" />);
    expect(await screen.findByRole("heading", { name: "Canon in D" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Score" })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Record" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("piece-listen-clock")).not.toBeInTheDocument();
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

  it("opens a PDF-recognised piece on the practise page", async () => {
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
      lastView: "practise",
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
    expect(
      await screen.findByRole("button", { name: "Record" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/import musicxml/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/once the page can be read/i)).not.toBeInTheDocument();
  });

  it("does not tell a confirmed PDF piece that the page still needs reading", async () => {
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
      lastView: "practise",
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
    expect(screen.queryByRole("tab", { name: "Score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Listen" })).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(
      "/practice/piece/empty-scan?view=practise",
      { scroll: false },
    );
    expect(screen.queryByText(/once the page can be read/i)).not.toBeInTheDocument();
  });

  it("hides tuning colours without deleting takes, then shows the next take", async () => {
    const score = parseMusicXmlToScore(TWINKLE_XML, "Canon in D");
    await savePieceStructuredScore("canon", score);
    const pitchReport = (attemptId: string) => ({
      schemaVersion: PIECE_FEEDBACK_SCHEMA_VERSION,
      pieceId: "canon",
      attemptId,
      skills: PIECE_FEEDBACK_CATEGORIES.map((category) => ({
        category,
        status: category === "pitch" ? ("ready" as const) : ("not_ready" as const),
        events: [],
      })),
      events: [],
      pitchNotes: [{ noteIndex: 0, cents: 3, heardSec: 0.4 }],
    });
    const attemptFields = {
      recordedAt: "2026-01-02T12:00:00.000Z",
      durationSec: 4,
      score0to100: 90,
      notesHeard: 1,
      notesExpected: 1,
      inTunePercent: 100,
      averageAbsCents: 3,
      feedback: "This take sat well in tune.",
      progressPercent: 90,
      hasRecording: false,
    };
    await appendPieceAttempt({
      pieceId: "canon",
      report: pitchReport("a1"),
      attempt: { attemptId: "a1", ...attemptFields },
    });
    search = new URLSearchParams("view=practise");
    render(<PieceWorkspaceView slug="canon-in-d" />);

    const stage = () =>
      document.querySelector(".musai-piece-workspace__practise-stage");
    await waitFor(() => {
      expect(stage()).toHaveAttribute("data-pitch-colours", "on");
    });
    fireEvent.click(screen.getByRole("button", { name: "Score options" }));
    fireEvent.click(screen.getByRole("tab", { name: "Plain" }));
    expect(screen.getByRole("tab", { name: "Plain" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(stage()).toHaveAttribute("data-pitch-colours", "off");
    expect(getPieceWorkspaceById("canon")?.attempts).toHaveLength(1);

    await appendPieceAttempt({
      pieceId: "canon",
      report: pitchReport("a2"),
      attempt: { attemptId: "a2", ...attemptFields },
    });
    fireEvent.click(screen.getByRole("button", { name: "Canon in D" }));
    fireEvent.change(screen.getByTestId("piece-name-input"), {
      target: { value: "Canon" },
    });
    fireEvent.keyDown(screen.getByTestId("piece-name-input"), { key: "Enter" });

    expect(await screen.findByRole("tab", { name: "Tuning" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      expect(stage()).toHaveAttribute("data-pitch-colours", "on");
    });
    expect(getPieceWorkspaceById("canon")?.attempts).toHaveLength(2);
  });
});
