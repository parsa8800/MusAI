"use client";

import dynamic from "next/dynamic";
import { MusaiLoadingScreen } from "@/components/MusaiLoadingMark";

const PieceStudioView = dynamic(
  () =>
    import("@/features/piece-studio/PieceStudioView").then((m) => ({
      default: m.PieceStudioView,
    })),
  {
    ssr: false,
    loading: () => <MusaiLoadingScreen label="Opening Piece studio" />,
  },
);

export default function PieceStudioPage() {
  return <PieceStudioView />;
}
