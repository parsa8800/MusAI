import { describe, expect, it } from "vitest";
import {
  MUSAI_PIECE_CATALOG_KEY,
  MUSAI_PIECE_HISTORY_KEY,
  MUSAI_PIECE_PROGRESS_KEY,
  isPieceStudioStorageKey,
} from "@/features/piece-studio/pieceStudioStorage";

describe("pieceStudioStorage", () => {
  it("namespaces keys so they cannot collide with other exercises", () => {
    expect(MUSAI_PIECE_CATALOG_KEY).toBe("musai-piece-catalog-v1");
    expect(MUSAI_PIECE_PROGRESS_KEY).toBe("musai-piece-progress-v1");
    expect(MUSAI_PIECE_HISTORY_KEY).toBe("musai-piece-history-v1");
    expect(isPieceStudioStorageKey(MUSAI_PIECE_CATALOG_KEY)).toBe(true);
    expect(isPieceStudioStorageKey("musai-scale-progress-v1")).toBe(false);
    expect(isPieceStudioStorageKey("musai-intonation-result-v1")).toBe(false);
  });
});
