/**
 * Piece Studio public surface.
 * Routes and the hub may import from here. Do not import Scale Studio
 * session, progress, or detection modules through this barrel.
 */
export { PIECE_STUDIO_HREF, pieceWorkspaceHref } from "@/features/piece-studio/pieceStudioRoutes";
export {
  MUSAI_PIECE_CATALOG_KEY,
  MUSAI_PIECE_HISTORY_KEY,
  MUSAI_PIECE_PROGRESS_KEY,
  isPieceStudioStorageKey,
} from "@/features/piece-studio/pieceStudioStorage";
export type {
  PieceDigitalScoreV1,
  PieceIdentityV1,
  PieceStudioPhase,
  PieceWorkspaceV1,
} from "@/features/piece-studio/pieceStudioTypes";
export { PIECE_STUDIO_SCHEMA_VERSION } from "@/features/piece-studio/pieceStudioTypes";
export type { MusaiScoreV1 } from "@/features/piece-studio/score/musaiScore";
export type {
  PieceCoachContextV1,
  PieceFeedbackEventV1,
  PieceFeedbackReportV1,
} from "@/features/piece-studio/feedback";
export { PieceStudioView } from "@/features/piece-studio/PieceStudioView";
export { PieceWorkspaceView } from "@/features/piece-studio/PieceWorkspaceView";
