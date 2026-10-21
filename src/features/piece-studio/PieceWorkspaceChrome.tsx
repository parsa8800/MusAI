"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { StudioViewport } from "@/components/StudioViewport";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";

/** Stay up for a full hop across the staff and back, even when the score is already ready. */
export const PIECE_LOAD_HOLD_MS = process.env.NODE_ENV === "test" ? 0 : 4400;

export const PIECE_VIEW_OPTIONS: { value: "score" | "practise"; label: string }[] =
  [
    { value: "score", label: "Score" },
    { value: "practise", label: "Practise" },
  ];

export function PieceWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <StudioViewport>
      <div className="musai-piece-workspace">
        <header className="musai-piece-workspace__nav flex shrink-0 items-center gap-2 px-0 py-2 sm:gap-3 sm:py-2.5">
          <PracticeHubBackLink
            className="!mb-0 shrink-0"
            href={PIECE_STUDIO_HREF}
            label="Piece studio"
            ariaLabel="Back to Piece studio"
          />
        </header>
        {children}
      </div>
    </StudioViewport>
  );
}

/** First paint — back arrow and the loading mark, until the piece is ready. */
export function PieceWorkspaceOpening() {
  return (
    <PieceWorkspaceShell>
      <div
        className="musai-piece-workspace__opening"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Preparing the score"
        data-testid="piece-workspace-opening"
      >
        <MusaiLoadingMark />
      </div>
    </PieceWorkspaceShell>
  );
}

export function PieceWorkspaceMissing({ slug }: { slug: string }) {
  return (
    <PieceWorkspaceShell>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-[var(--musai-muted)]">
          “{slug}” isn’t in your library. Import it again from Piece studio.
        </p>
        <Link href={PIECE_STUDIO_HREF} className="musai-btn-primary">
          Piece studio
        </Link>
      </div>
    </PieceWorkspaceShell>
  );
}

export function AudioListenDock({
  objectUrl,
  title,
}: {
  objectUrl: string | null;
  title: string;
}) {
  if (objectUrl) {
    return (
      <div className="musai-piece-dock">
        <p className="musai-piece-dock__label">Reference</p>
        <audio
          className="musai-piece-audio"
          controls
          src={objectUrl}
          aria-label={`Listen to ${title}`}
        >
          Your browser can’t play this audio.
        </audio>
      </div>
    );
  }
  return (
    <div className="musai-piece-dock">
      <p className="musai-piece-dock__copy">No reference audio for this piece yet.</p>
    </div>
  );
}
