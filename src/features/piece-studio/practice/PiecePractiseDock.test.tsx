import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PiecePractiseDock } from "@/features/piece-studio/practice/PiecePractiseDock";
import { clearPieceCatalog, upsertPieceWorkspace } from "@/features/piece-studio/pieceStudioCatalog";
import { clearPieceFileMemory } from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

const startRecording = vi.fn(async () => undefined);
const stopRecording = vi.fn();
const setCaptureMode = vi.fn();
const setSelectedMicId = vi.fn();
const refreshMicDevices = vi.fn(async () => undefined);
const handleFileChange = vi.fn();

vi.mock("@/features/piece-studio/practice/usePiecePracticeCapture", () => ({
  usePiecePracticeCapture: () => ({
    selectId: "mic",
    captureMode: "record",
    setCaptureMode,
    isRecording: false,
    recordedBlob: null,
    file: null,
    uploadProcessing: false,
    fileInputRef: { current: null },
    handleFileChange,
    mainRecorderRef: { current: null },
    micDevices: [],
    selectedMicId: "",
    setSelectedMicId,
    refreshMicDevices,
    startRecording,
    stopRecording,
    discardRecording: vi.fn(),
    streamRef: { current: null },
    elapsedLabel: "0:00",
    lastTakeLabel: null,
    levelBars: [],
    waveformSamples: [],
    waveformLiveRef: { current: null },
    message: null,
    status: "idle",
    analysing: false,
  }),
}));

const piece = {
  schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
  pieceId: "p1",
  slug: "twinkle",
  title: "Twinkle",
  composer: null,
  sourceKind: "musicxml" as const,
  sourceFileName: "twinkle.musicxml",
  sourceMimeType: "application/xml",
  importedAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
  lastView: "practise" as const,
  score: {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    format: "musicxml" as const,
    title: "Twinkle",
    composer: null,
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
};

describe("PiecePractiseDock", () => {
  beforeEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
    startRecording.mockClear();
    stopRecording.mockClear();
    upsertPieceWorkspace(piece);
  });

  it("keeps Try again / Record primary with Mic control and import", () => {
    render(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    expect(screen.getByTestId("piece-practise-dock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record" })).toHaveTextContent(
      "Record",
    );
    expect(screen.queryByText(/Analyse/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mic & import/i)).not.toBeInTheDocument();
    const mic = screen.getByTestId("piece-practise-mic");
    expect(mic).toBeInTheDocument();
    expect(mic).toHaveAccessibleName(/Microphone: Default microphone/i);
    expect(screen.getByText("Mic")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Default microphone" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Import a take/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(startRecording).toHaveBeenCalled();
  });

  it("shows a compact Progress block for a practised piece", () => {
    const practised = {
      ...piece,
      personalBestScore: 82,
      lifetimeAttemptCount: 7,
      lastPractisedAt: "2026-01-03T12:00:00.000Z",
      progressPercent: 82,
      attempts: [
        {
          attemptId: "a6",
          recordedAt: "2026-01-02T12:00:00.000Z",
          attemptNumber: 6,
          durationSec: 8,
          score0to100: 80,
          notesHeard: 6,
          notesExpected: 7,
          inTunePercent: 75,
          averageAbsCents: 14,
          feedback: "Try again when you’re ready.",
          progressPercent: 80,
          hasRecording: false,
        },
        {
          attemptId: "a7",
          recordedAt: "2026-01-03T12:00:00.000Z",
          attemptNumber: 7,
          durationSec: 9,
          score0to100: 76,
          notesHeard: 6,
          notesExpected: 7,
          inTunePercent: 70,
          averageAbsCents: 16,
          feedback: "Try again when you’re ready.",
          progressPercent: 76,
          hasRecording: false,
        },
      ],
    };
    render(
      <PiecePractiseDock
        piece={practised}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    const summary = screen.getByTestId("piece-progress-summary");
    expect(summary).toHaveTextContent(/Progress/);
    expect(summary).toHaveTextContent(/Best\s*82%/);
    expect(summary).toHaveTextContent(/Latest\s*76%/);
    expect(summary).toHaveTextContent(/7 attempts/);
    expect(screen.getByText(/-4 from last take/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
