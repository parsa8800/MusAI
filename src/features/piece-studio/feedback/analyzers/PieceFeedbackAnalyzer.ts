import type { PieceExpectedNote } from "@/features/piece-studio/score/expectedNotes";
import type { PiecePitchMatch } from "@/features/piece-studio/pitch/piecePitchMatch";
import type {
  PieceFeedbackCategory,
  PieceFeedbackReportV1,
  PieceSkillReportV1,
} from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

export type PieceAnalyzerAudio = {
  mono: Float32Array;
  sampleRateHz: number;
  durationSec: number;
};

/**
 * Shared input for every skill analyzer.
 * Analyzers may ignore audio or history; orchestration never peeks inside them.
 */
export type PieceAnalyzerInput = {
  pieceId: string;
  attemptId: string;
  score: MusaiScoreV1 | null;
  expectedNotes: readonly PieceExpectedNote[];
  audio?: PieceAnalyzerAudio;
  /** Shared pitch match from the take entrypoint — avoids a second DSP pass. */
  pitchMatch?: PiecePitchMatch;
  /** Prior reports on this piece. Consistency uses this when it is ready. */
  history?: readonly PieceFeedbackReportV1[];
};

/**
 * One musical skill. Replace or improve a single analyzer without touching
 * capture, Coach Parsa, or sibling skills.
 */
export type PieceFeedbackAnalyzer = {
  readonly category: PieceFeedbackCategory;
  analyze(input: PieceAnalyzerInput): PieceSkillReportV1;
};
