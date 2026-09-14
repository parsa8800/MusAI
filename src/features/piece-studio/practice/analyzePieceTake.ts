import { defaultPieceFeedbackAnalyzers } from "@/features/piece-studio/feedback/analyzers/defaultAnalyzers";
import type { PieceAnalyzerInput } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import { runPieceFeedback } from "@/features/piece-studio/feedback/pieceFeedbackOrchestrator";
import type { PieceFeedbackReportV1 } from "@/features/piece-studio/feedback/pieceFeedbackTypes";
import {
  analyzePiecePerformance,
  type PiecePerformanceResult,
} from "@/features/piece-studio/practice/analyzePiecePerformance";
import { expectedNotesFromScore } from "@/features/piece-studio/score/expectedNotes";
import { matchPiecePitch } from "@/features/piece-studio/pitch/piecePitchMatch";
import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";

export type PieceTakeAnalysis = {
  performance: PiecePerformanceResult | null;
  report: PieceFeedbackReportV1;
};

/**
 * Practise entry: numeric take summary plus structured skill reports.
 * Runs pitch detection once and shares it with performance + PitchAnalyzer.
 */
export function analyzePieceTake(input: {
  pieceId: string;
  attemptId: string;
  score: MusaiScoreV1 | null;
  mono: Float32Array;
  sampleRateHz: number;
  durationSec: number;
  history?: PieceFeedbackReportV1[];
}): PieceTakeAnalysis {
  const expectedNotes = expectedNotesFromScore(input.score);
  const pitchMatch =
    expectedNotes.length > 0
      ? matchPiecePitch({
          mono: input.mono,
          sampleRateHz: input.sampleRateHz,
          expectedMidis: expectedNotes.map((n) => n.midi),
        })
      : null;
  const performance =
    pitchMatch != null
      ? analyzePiecePerformance({
          mono: input.mono,
          sampleRateHz: input.sampleRateHz,
          expectedMidis: expectedNotes.map((n) => n.midi),
          pitchMatch,
        })
      : null;
  const analyzerInput: PieceAnalyzerInput = {
    pieceId: input.pieceId,
    attemptId: input.attemptId,
    score: input.score,
    expectedNotes,
    audio: {
      mono: input.mono,
      sampleRateHz: input.sampleRateHz,
      durationSec: input.durationSec,
    },
    pitchMatch: pitchMatch ?? undefined,
    history: input.history,
  };
  const report = runPieceFeedback(analyzerInput, defaultPieceFeedbackAnalyzers());
  return { performance, report };
}
