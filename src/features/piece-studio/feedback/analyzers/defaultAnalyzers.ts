import type { PieceFeedbackAnalyzer } from "@/features/piece-studio/feedback/analyzers/PieceFeedbackAnalyzer";
import { ConsistencyAnalyzer } from "@/features/piece-studio/feedback/analyzers/ConsistencyAnalyzer";
import { DynamicsAnalyzer } from "@/features/piece-studio/feedback/analyzers/DynamicsAnalyzer";
import { PitchAnalyzer } from "@/features/piece-studio/feedback/analyzers/PitchAnalyzer";
import { RhythmAnalyzer } from "@/features/piece-studio/feedback/analyzers/RhythmAnalyzer";
import { TempoAnalyzer } from "@/features/piece-studio/feedback/analyzers/TempoAnalyzer";

/**
 * Default skill registry. Swap or replace one analyzer here without touching
 * capture, orchestration internals, or Coach Parsa.
 */
export function defaultPieceFeedbackAnalyzers(): PieceFeedbackAnalyzer[] {
  return [
    PitchAnalyzer,
    RhythmAnalyzer,
    TempoAnalyzer,
    DynamicsAnalyzer,
    ConsistencyAnalyzer,
  ];
}
