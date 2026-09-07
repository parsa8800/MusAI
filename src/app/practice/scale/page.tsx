import { ScaleStudioSelector } from "@/components/ScaleStudioSelector";
import { Suspense } from "react";

function ScaleStudioFallback() {
  return (
    <div className="flex w-full max-w-[min(1280px,100%)] flex-col items-center py-16">
      <div
        className="h-10 w-10 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
        aria-hidden
      />
    </div>
  );
}

export default function ScalePracticePage() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-24 pt-10 sm:px-8 sm:pt-12">
      <Suspense fallback={<ScaleStudioFallback />}>
        <ScaleStudioSelector />
      </Suspense>
    </div>
  );
}
