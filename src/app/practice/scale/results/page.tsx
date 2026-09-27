"use client";

import { Suspense, useEffect } from "react";
import { MusaiLoadingScreen } from "@/components/MusaiLoadingMark";
import { useRouter, useSearchParams } from "next/navigation";
import {
  persistScalePracticeSession,
  readScalePracticeHistoryEntry,
  readScalePracticeSession,
} from "@/lib/scalePracticeSession";
import { scaleWorkspaceHref } from "@/lib/scaleWorkspace";

function ResultsLoading() {
  return <MusaiLoadingScreen label="Loading" />;
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
