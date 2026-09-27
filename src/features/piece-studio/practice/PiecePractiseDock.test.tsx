import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PiecePractiseDock } from "@/features/piece-studio/practice/PiecePractiseDock";
import { clearPieceCatalog, upsertPieceWorkspace } from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  savePieceAttemptRecording,
} from "@/features/piece-studio/pieceStudioFiles";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { parseMusicXmlToScore } from "@/features/piece-studio/score/parseMusicXml";
import { TWINKLE_XML } from "@/features/piece-studio/score/musicXmlFixtures";

const startRecording = vi.fn(async () => undefined);
const stopRecording = vi.fn();
const setCaptureMode = vi.fn();
const setSelectedMicId = vi.fn();
const refreshMicDevices = vi.fn(async () => undefined);
const handleFileChange = vi.fn();
const discardRecording = vi.fn();
const loadSampleTake = vi.fn();

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
    loadSampleTake,
    discardRecording,
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the shared Scale Studio circular record control with a secondary mic", () => {
    render(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    expect(screen.getByTestId("piece-practise-dock")).toBeInTheDocument();
    expect(document.querySelector(".musai-rec-bar")).toBeTruthy();
    const record = screen.getByTestId("musai-rec-anchor");
    expect(record).toBeInTheDocument();
    expect(record).toHaveAttribute("data-recording", "false");
    expect(record).toHaveClass("musai-vm-trigger--studio");
    expect(screen.getByRole("button", { name: "Record" })).toBe(record);
    expect(
      screen.queryByText("Record", { selector: ".musai-rec-stage__caption" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Recording volume history/i),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".musai-rec-wave-well")).toBeNull();
    expect(screen.queryByText("00:00.00")).not.toBeInTheDocument();
    expect(screen.queryByText(/Analyse/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mic & import/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Import a take/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /^Microphone$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Default microphone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^RECORD$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-score-pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PDF/i })).not.toBeInTheDocument();
    fireEvent.click(record);
    expect(startRecording).toHaveBeenCalled();
  });

  it("does not show Best / Latest / attempts on the practise dock", () => {
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
    expect(screen.queryByTestId("piece-progress-summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/Best/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Latest/)).not.toBeInTheDocument();
    expect(screen.queryByText(/7 attempts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/-4 from last take/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByTestId("musai-rec-anchor")).toBeInTheDocument();
  });

  it("lets the student play the last take back", async () => {
    const createObjectURL = vi.fn(() => "blob:take");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
    await savePieceAttemptRecording(
      "p1",
      "a1",
      new Blob(["audio"], { type: "audio/webm" }),
    );
    const practised = {
      ...piece,
      attempts: [
        {
          attemptId: "a1",
          recordedAt: "2026-01-03T12:00:00.000Z",
          attemptNumber: 1,
          durationSec: 8,
          score0to100: 80,
          notesHeard: 6,
          notesExpected: 7,
          inTunePercent: 75,
          averageAbsCents: 14,
          feedback: "Try again when you’re ready.",
          progressPercent: 80,
          hasRecording: true,
        },
      ],
    };
    const onPlayheadClock = vi.fn();
    render(
      <PiecePractiseDock
        piece={practised}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
        onPlayheadClock={onPlayheadClock}
      />,
    );
    expect(await screen.findByTestId("piece-take-replay")).toBeInTheDocument();
    expect(screen.getByTestId("piece-practise-take-audio")).not.toHaveAttribute(
      "controls",
    );
    expect(screen.getByRole("button", { name: "Play Take 1" })).toBeInTheDocument();
    expect(screen.getByText("Last take")).toBeInTheDocument();
    expect(screen.queryByText("0:00 / 0:08")).not.toBeInTheDocument();
    expect(screen.queryByText("0:00 / 0:00")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onPlayheadClock).toHaveBeenCalled();
    });
    const clock = onPlayheadClock.mock.calls.at(-1)?.[0];
    expect(clock?.getCurrentSec()).toBe(0);
  });
});
