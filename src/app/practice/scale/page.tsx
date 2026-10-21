import { MusaiLoadingScreen, StudioReveal } from "@/components/MusaiLoadingMark";
import { ScaleStudioSelector } from "@/features/scale-studio";
import { Suspense } from "react";

export default function ScalePracticePage() {
  return (
    <Suspense fallback={<MusaiLoadingScreen label="Opening Scale studio" />}>
      <StudioReveal label="Opening Scale studio">
        <ScaleStudioSelector />
      </StudioReveal>
    </Suspense>
  );
}
