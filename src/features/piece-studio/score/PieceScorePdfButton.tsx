"use client";

import { useState } from "react";
import { openPieceScorePdf } from "@/features/piece-studio/score/exportPieceScorePdf";
import { tapFeedback } from "@/lib/motion";

/**
 * Opens a real PDF of the engraved score in a new tab.
 * Does not call window.print() — download/print stay optional in the PDF viewer.
 */
export function PieceScorePdfButton({
  title,
  className = "musai-piece-score-pdf",
  showLabel = false,
}: {
  title: string;
  className?: string;
  /** When true, shows “View PDF” next to the glyph (Score chrome). */
  showLabel?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={`musai-pressable musai-piece-score-pdf ${showLabel ? "musai-piece-score-pdf--labeled" : ""} ${className}`}
      data-testid="piece-score-pdf"
      title="View PDF"
      aria-label="View PDF"
      disabled={busy}
      onClick={() => {
        if (busy) return;
        tapFeedback("light");
        setBusy(true);
        void openPieceScorePdf({ title }).finally(() => setBusy(false));
      }}
    >
      <PdfGlyph />
      {showLabel ? (
        <span className="musai-piece-score-pdf__label">View PDF</span>
      ) : null}
    </button>
  );
}

function PdfGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="musai-piece-score-pdf__glyph"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 3H7.75A.75.75 0 007 3.75v16.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75V9.5L14 3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6.5h5.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 13.25h5M9.5 16.25h5"
      />
    </svg>
  );
}
