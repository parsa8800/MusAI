import { afterEach, describe, expect, it } from "vitest";
import {
  clearPieceCatalog,
  getPieceWorkspaceById,
  upsertPieceWorkspace,
} from "@/features/piece-studio/pieceStudioCatalog";
import {
  clearPieceFileMemory,
  readPieceAttemptRecording,
  readPieceFeedbackReport,
} from "@/features/piece-studio/pieceStudioFiles";
import { appendPieceAttempt } from "@/features/piece-studio/practice/piecePracticeAttempts";
import {
  pieceAttemptFeedback,
  pieceTakeCopy,
} from "@/features/piece-studio/practice/piecePracticeCopy";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import { PIECE_FEEDBACK_SCHEMA_VERSION } from "@/features/piece-studio/feedback/pieceFeedbackTypes";

describe("piece practise loop", () => {
  afterEach(() => {
    clearPieceCatalog();
    clearPieceFileMemory();
  });

  it("numbers takes and keeps Try again copy on this piece", () => {
    expect(pieceTakeCopy(0)).toMatchObject({
      takeNumber: 1,
      label: "Take 1",
      again: false,
    });
    expect(pieceTakeCopy(1)).toMatchObject({
      takeNumber: 2,
      label: "Take 2",
      hint: "Try again",
      again: true,
    });
  });

  it("saves an attempt against the piece with recording and personal best", async () => {
    upsertPieceWorkspace({
      schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
      pieceId: "p1",
      slug: "minuet",
      title: "Minuet",
      composer: null,
      sourceKind: "musicxml",
      sourceFileName: "minuet.musicxml",
      sourceMimeType: "application/xml",
      importedAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      lastView: "practise",
      score: {
        schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
        format: "musicxml",
        title: "Minuet",
        composer: null,
        keySignature: null,
        timeSignature: null,
        tempoBpm: null,
        measureCount: 4,
        hasStructuredScore: true,
        noteCount: 8,
        restCount: 0,
      },
      attempts: [],
      progressPercent: 0,
      hasOriginalFile: false,
    });
    const blob = new Blob(["audio"], { type: "audio/webm" });
    const saved = await appendPieceAttempt({
      pieceId: "p1",
      recording: blob,
      report: {
        schemaVersion: PIECE_FEEDBACK_SCHEMA_VERSION,
        pieceId: "p1",
        attemptId: "a1",
        skills: [
          { category: "pitch", status: "ready", events: [] },
          { category: "rhythm", status: "not_ready", events: [] },
          { category: "tempo", status: "not_ready", events: [] },
          { category: "dynamics", status: "not_ready", events: [] },
          { category: "consistency", status: "not_ready", events: [] },
        ],
        events: [],
      },
      attempt: {
        attemptId: "a1",
        recordedAt: "2026-01-02T12:00:00.000Z",
        durationSec: 4,
        score0to100: 86,
        notesHeard: 7,
        notesExpected: 8,
        inTunePercent: 80,
        averageAbsCents: 12,
        feedback: "Some written notes were missing.",
        progressPercent: 86,
        hasRecording: true,
        feedbackSkills: {
          pitch: "ready",
          rhythm: "not_ready",
          tempo: "not_ready",
          dynamics: "not_ready",
          consistency: "not_ready",
        },
      },
    });
    expect(saved?.attempts).toHaveLength(1);
    expect(saved?.attempts[0]?.attemptNumber).toBe(1);
    expect(saved?.attempts[0]?.feedbackSkills?.pitch).toBe("ready");
    expect(saved?.attempts[0]?.feedbackSkills?.rhythm).toBe("not_ready");
    expect(saved?.personalBestScore).toBe(86);
    expect(saved?.progressPercent).toBe(86);
    expect(getPieceWorkspaceById("p1")?.attempts[0]?.attemptId).toBe("a1");
    expect(await readPieceAttemptRecording("p1", "a1")).toBeTruthy();
    const stored = await readPieceFeedbackReport("p1", "a1");
    expect(stored?.skills.find((s) => s.category === "rhythm")?.status).toBe(
      "not_ready",
    );
    expect(stored?.events).toEqual([]);
  });

  it("keeps a take even when notes cannot be checked", () => {
    expect(pieceAttemptFeedback(null, false)).toMatch(/digital score/i);
  });
});
