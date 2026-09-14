"use client";

import dynamic from "next/dynamic";

const PieceStudioView = dynamic(
  () =>
    import("@/features/piece-studio/PieceStudioView").then((m) => ({
      default: m.PieceStudioView,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-[var(--musai-muted)]">
        Opening Piece studio…
      </div>
    ),
  },
);

export default function PieceStudioPage() {
  return <PieceStudioView />;
}
