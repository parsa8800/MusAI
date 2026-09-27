import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";

/**
 * Covers the score while it and the piano samples finish.
 * Opaque, so the playhead cannot show through.
 */
export function PiecePrepareMark() {
  return (
    <div
      className="musai-piece-prepare"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing the score"
      data-testid="piece-listen-preparing"
    >
      <MusaiLoadingMark />
    </div>
  );
}
