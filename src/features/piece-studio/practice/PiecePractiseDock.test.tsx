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
const setSelectedMicId = vi.fn();
const refreshMicDevices = vi.fn(async () => undefined);
const handleFileChange = vi.fn();
const discardRecording = vi.fn();
const discardClip = vi.fn();
const captureState = vi.hoisted(() => ({
  mode: "record" as "record" | "upload",
}));
const setCaptureMode = vi.hoisted(() => vi.fn());

vi.mock("@/features/piece-studio/practice/usePiecePracticeCapture", () => ({
  usePiecePracticeCapture: () => ({
    selectId: "mic",
    captureMode: captureState.mode,
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
    discardRecording,
    discardClip,
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
    captureState.mode = "record";
    startRecording.mockClear();
    stopRecording.mockClear();
    setCaptureMode.mockClear();
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
    expect(record).toHaveAccessibleName("Record");
    expect(screen.getByRole("tab", { name: "Record" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Import" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
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
    expect(
      screen.getByRole("combobox", { name: /^Microphone$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Default microphone/i)).not.toBeInTheDocument();
    expect(screen.queryByText("RECORD")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-score-pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PDF/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sample take" })).not.toBeInTheDocument();
    fireEvent.click(record);
    expect(startRecording).toHaveBeenCalled();
  });

  it("imports a pre-recorded take from the shared capture dock", () => {
    const view = render(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Import" }));
    expect(setCaptureMode).toHaveBeenCalledWith("upload");
    captureState.mode = "upload";
    view.rerender(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    expect(screen.getByRole("tab", { name: "Import" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector("[data-mode='upload']")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByText("Import audio")).toBeInTheDocument();
    expect(screen.getByText("Drop a file or tap to choose")).toBeInTheDocument();
    expect(screen.getByTestId("musai-rec-anchor")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Play last take" })).toBeInTheDocument();
    expect(screen.getByText("Last take")).toBeInTheDocument();
    expect(screen.queryByText("0:00 / 0:08")).not.toBeInTheDocument();
    expect(screen.queryByText("0:00 / 0:00")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onPlayheadClock).toHaveBeenCalled();
    });
    const clock = onPlayheadClock.mock.calls.at(-1)?.[0];
    expect(clock?.getCurrentSec()).toBe(0);
  });

  it("hides a computer-generated sample take", async () => {
    await savePieceAttemptRecording(
      "p1",
      "sample",
      new Blob(["RIFF"], { type: "audio/wav; musai-sample=1" }),
    );
    const practised = {
      ...piece,
      attempts: [
        {
          attemptId: "sample",
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
    render(
      <PiecePractiseDock
        piece={practised}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    expect(screen.queryByText("Sample take")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piece-take-replay")).not.toBeInTheDocument();
    expect(screen.queryByText("Last take")).not.toBeInTheDocument();
  });

  it("offers a plain score only when a take has tuning colours", () => {
    render(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Score options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Plain" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Tuning" })).not.toBeInTheDocument();
  });

  it("asks the workspace to hide or show tuning colours", () => {
    const onTogglePitchColours = vi.fn();
    const view = render(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
        showPitchColourToggle
        pitchColoursOn
        onTogglePitchColours={onTogglePitchColours}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Tuning" })).not.toBeInTheDocument();
    expect(screen.queryByText("Colours from this take")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Score options" }));
    expect(screen.getByRole("tab", { name: "Tuning" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Plain" }));
    expect(onTogglePitchColours).toHaveBeenCalledTimes(1);

    view.rerender(
      <PiecePractiseDock
        piece={piece}
        structured={parseMusicXmlToScore(TWINKLE_XML, "Twinkle")}
        onAttemptSaved={() => undefined}
        showPitchColourToggle
        pitchColoursOn={false}
        onTogglePitchColours={onTogglePitchColours}
      />,
    );
    expect(screen.getByRole("tab", { name: "Plain" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Notes without colours")).not.toBeInTheDocument();
  });
});
