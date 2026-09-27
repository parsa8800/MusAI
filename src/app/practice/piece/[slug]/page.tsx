import { Suspense } from "react";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { StudioViewport } from "@/components/StudioViewport";
import { MusaiLoadingMark } from "@/components/MusaiLoadingMark";
import { PieceWorkspaceView } from "@/features/piece-studio/PieceWorkspaceView";
import { PIECE_STUDIO_HREF } from "@/features/piece-studio/pieceStudioRoutes";

/** Must match PieceWorkspaceView’s opening shell first paint. */
function WorkspaceFallback() {
  return (
    <StudioViewport>
      <div className="musai-piece-workspace">
        <header className="musai-piece-workspace__nav">
          <PracticeHubBackLink
            className="!mb-0 shrink-0"
            href={PIECE_STUDIO_HREF}
            label="Piece studio"
            ariaLabel="Back to Piece studio"
          />
        </header>
        <div
          className="musai-piece-workspace__opening"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Preparing the score"
        >
          <MusaiLoadingMark />
        </div>
      </div>
    </StudioViewport>
  );
}

export default async function PieceWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <PieceWorkspaceView slug={slug} />
    </Suspense>
  );
}
