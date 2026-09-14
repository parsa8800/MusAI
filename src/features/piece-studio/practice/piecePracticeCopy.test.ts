import { describe, expect, it } from "vitest";
import { pieceLibraryCardModel } from "@/features/piece-studio/practice/piecePracticeCopy";
import { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";

function base(overrides: Partial<PieceWorkspaceV1> = {}): PieceWorkspaceV1 {
  return {
    schemaVersion: PIECE_STUDIO_SCHEMA_VERSION,
    pieceId: "p1",
    slug: "twinkle",
    title: "Twinkle",
    composer: "Mozart",
    sourceKind: "musicxml",
    sourceFileName: "Twinkle.musicxml",
    sourceMimeType: "application/xml",
    importedAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-02T00:00:00.000Z",
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
      noteCount: 12,
      restCount: 0,
    },
    attempts: [],
    progressPercent: 0,
    hasOriginalFile: true,
    ...overrides,
  };
}

describe("pieceLibraryCardModel", () => {
  it("keeps unpractised cards to title and composer only", () => {
    const model = pieceLibraryCardModel(base(), { needsCheck: false });
    expect(model).toMatchObject({
      state: "ready",
      statusLabel: null,
      metaLine: null,
      actionLabel: "Open",
      composer: "Mozart",
      bestPercent: null,
      attempts: 0,
    });
  });

  it("marks review pieces quietly", () => {
    const model = pieceLibraryCardModel(base(), { needsCheck: true });
    expect(model).toMatchObject({
      state: "check",
      statusLabel: "Review",
      metaLine: "Review",
      actionLabel: "Check",
    });
  });

  it("exposes best score and progress fill without attempt clutter", () => {
    const model = pieceLibraryCardModel(
      base({
        personalBestScore: 82,
        lifetimeAttemptCount: 2,
        lastPractisedAt: "2026-01-02T11:00:00.000Z",
        progressPercent: 82,
        attempts: [
          {
            attemptId: "a1",
            recordedAt: "2026-01-02T10:00:00.000Z",
            attemptNumber: 1,
            durationSec: 20,
            score0to100: 80,
            notesHeard: 10,
            notesExpected: 12,
            inTunePercent: 80,
            averageAbsCents: 12,
            feedback: "ok",
            progressPercent: 80,
            hasRecording: false,
          },
          {
            attemptId: "a2",
            recordedAt: "2026-01-02T11:00:00.000Z",
            attemptNumber: 2,
            durationSec: 22,
            score0to100: 82,
            notesHeard: 11,
            notesExpected: 12,
            inTunePercent: 82,
            averageAbsCents: 10,
            feedback: "ok",
            progressPercent: 82,
            hasRecording: false,
          },
        ],
      }),
      { needsCheck: false },
    );
    expect(model.state).toBe("practised");
    expect(model.actionLabel).toBe("Continue");
    expect(model.statusLabel).toBeNull();
    expect(model.bestPercent).toBe(82);
    expect(model.attempts).toBe(2);
    expect(model.progressFill).toBe(82);
    expect(model.metaLine).toBe("Best 82%");
  });
});
