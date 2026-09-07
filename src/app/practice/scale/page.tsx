import { ScaleStudioSelector } from "@/components/ScaleStudioSelector";
import { Suspense } from "react";

function ScaleStudioFallback() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center">
      <div
        className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
        aria-hidden
      />
    </div>
  );
}

export default function ScalePracticePage() {
  return (
    <Suspense fallback={<ScaleStudioFallback />}>
      <ScaleStudioSelector />
    </Suspense>
  );
}
