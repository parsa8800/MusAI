"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  persistScalePracticeSession,
  readScalePracticeHistoryEntry,
  readScalePracticeSession,
} from "@/lib/scalePracticeSession";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

function ResultsLoading() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 pb-24 pt-14 sm:px-8">
      <div
        className="h-12 w-12 rounded-full border-2 border-[var(--musai-border)] border-t-[var(--musai-accent)] motion-safe:animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      <p className="mt-6 text-sm text-[var(--musai-muted)]">Loading…</p>
    </div>
  );
}

function ScalePracticeResultsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const wantedId = searchParams.get("id");
    let next = readScalePracticeSession();
    if (wantedId) {
      const fromHistory = readScalePracticeHistoryEntry(wantedId);
      if (fromHistory) {
        persistScalePracticeSession(fromHistory);
        next = fromHistory;
      }
    }
    if (!next) {
      router.replace("/practice/scale");
      return;
    }
    router.replace(
      scaleWorkspaceHref(next.scaleId, next.octaveSpan, next.rootMidi),
    );
  }, [router, searchParams]);

  return <ResultsLoading />;
}

export default function ScalePracticeResultsPage() {
  return (
    <Suspense fallback={<ResultsLoading />}>
      <ScalePracticeResultsInner />
    </Suspense>
  );
}
