import { createOpenSheetMusicDisplayRenderer } from "@/features/piece-studio/score/OpenSheetMusicDisplayRenderer";
import type { ScoreRenderer } from "@/features/piece-studio/score/ScoreRenderer";

/** Default notation engine for Piece Studio. Swap here to change backends. */
export function createDefaultScoreRenderer(): ScoreRenderer {
  return createOpenSheetMusicDisplayRenderer();
}
