import type { PieceFeedbackSkillMap } from "@/features/piece-studio/feedback/pieceFeedbackTypes";

export const PIECE_STUDIO_SCHEMA_VERSION = 1 as const;

export type PieceStudioPhase =
  | "ready"
  | "recording"
  | "analysing"
  | "results";

export type PieceWorkspaceView = "score" | "listen" | "practise";

export type PieceSourceKind =
  | "musicxml"
  | "midi"
  | "pdf"
  | "image"
  | "audio"
  | "unknown";

/** Result of reading a PDF/photo into a digital score. Absent on MusicXML imports. */
export type PieceRecognitionStatus = "none" | "ready" | "failed";

/** Student-facing check prompts after a page is read (not vendor confidence). */
export type PieceRecognitionHint = string;

/** Catalog summary of a piece. Full note-level data lives in IndexedDB as MusaiScoreV1. */
export type PieceDigitalScoreV1 = {
  schemaVersion: typeof PIECE_STUDIO_SCHEMA_VERSION;
  format: PieceSourceKind;
  title: string;
  composer: string | null;
  keySignature: string | null;
  timeSignature: string | null;
  tempoBpm: number | null;
  measureCount: number | null;
  /** True when a normalised MusAI score was parsed from MusicXML / MXL. */
  hasStructuredScore: boolean;
  noteCount: number | null;
  restCount: number | null;
};

export type PieceAttemptV1 = {
  attemptId: string;
  recordedAt: string;
  attemptNumber: number;
  durationSec: number | null;
  /** 0–100 when notes could be checked against the digital score. */
  score0to100: number | null;
  notesHeard: number | null;
  notesExpected: number | null;
  inTunePercent: number | null;
  averageAbsCents: number | null;
  feedback: string | null;
  progressPercent: number | null;
  hasRecording: boolean;
  /** Which musical skills actually ran on this take. */
  feedbackSkills?: PieceFeedbackSkillMap | null;
};

export type PieceIdentityV1 = {
  schemaVersion: typeof PIECE_STUDIO_SCHEMA_VERSION;
  pieceId: string;
  slug: string;
  title: string;
};

/** One imported piece and its practice workspace. */
export type PieceWorkspaceV1 = {
  schemaVersion: typeof PIECE_STUDIO_SCHEMA_VERSION;
  pieceId: string;
  slug: string;
  title: string;
  composer: string | null;
  sourceKind: PieceSourceKind;
  sourceFileName: string;
  sourceMimeType: string;
  importedAt: string;
  lastOpenedAt: string;
  lastView: PieceWorkspaceView;
  score: PieceDigitalScoreV1;
  attempts: PieceAttemptV1[];
  progressPercent: number;
  /** Best analysed take on this piece (0–100). Never lowered by a weaker take. */
  personalBestScore?: number | null;
  /**
   * Total takes ever saved on this piece (survives the rolling attempt window).
   * Prefer this for “Attempts: N” in the UI.
   */
  lifetimeAttemptCount?: number;
  /** ISO time of the most recent saved take. */
  lastPractisedAt?: string | null;
  hasOriginalFile: boolean;
  /** Present after a PDF/photo read attempt. */
  recognitionStatus?: PieceRecognitionStatus;
  recognitionMessage?: string | null;
  /** False until the student accepts a reconstructed score from a page scan. */
  recognitionConfirmed?: boolean;
  /** Places that may need a quick human check. */
  recognitionHints?: PieceRecognitionHint[];
  /** 0-based measure to highlight when recognition confidence is uncertain. */
  recognitionFocusMeasure?: number | null;
};

export const PIECE_WORKSPACE_VIEWS: readonly PieceWorkspaceView[] = [
  "score",
  "listen",
  "practise",
];

export function isPieceWorkspaceView(v: string): v is PieceWorkspaceView {
  return (PIECE_WORKSPACE_VIEWS as readonly string[]).includes(v);
}
