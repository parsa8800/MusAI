import { Suspense } from "react";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { StudioViewport } from "@/components/StudioViewport";
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div
            className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          <p className="text-sm text-[var(--musai-muted)]">Opening piece…</p>
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
