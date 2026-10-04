/**
 * Piece Studio persistence keys.
 * Never read or write Scale Studio / tuner / trainer keys from this module.
 */
export const MUSAI_PIECE_CATALOG_KEY = "musai-piece-catalog-v1";
/** Reserved for later progress snapshots (catalog already stores percent). */
export const MUSAI_PIECE_PROGRESS_KEY = "musai-piece-progress-v1";
export const MUSAI_PIECE_HISTORY_KEY = "musai-piece-history-v1";
export const MUSAI_PIECE_FILES_DB = "musai-piece-files-v1";
/** In-progress upload (file in IndexedDB, status in sessionStorage). Survives a refresh. */
export const MUSAI_PIECE_IMPORT_ACTIVE_KEY = "musai-piece-import-active";

export function isPieceStudioStorageKey(key: string): boolean {
  return key.startsWith("musai-piece-");
}
