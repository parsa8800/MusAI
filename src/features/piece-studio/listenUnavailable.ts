import type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
import type { PieceWorkspaceV1 } from "@/features/piece-studio/pieceStudioTypes";

/**
 * Listen availability depends on a playable MusaiScoreV1 — not on whether the
 * upload was PDF/image vs MusicXML. After confirm, sourceKind only describes
 * the original file, never whether playback is allowed.
 */
export function listenUnavailable(
  piece: PieceWorkspaceV1,
  ready: boolean,
  structured: MusaiScoreV1 | null | undefined,
): string | null {
  if (piece.sourceKind === "audio") return null;
  if (structured === undefined) return "Preparing playback…";
  if (ready) return null;
  if (piece.recognitionStatus === "failed") {
    return "Playback needs a digital score. Your original page is still saved.";
  }
  return "This score doesn’t have timing to play yet.";
}
