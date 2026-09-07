"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScalePracticeResultsView } from "@/components/ScalePracticeResultsView";
import {
  persistScalePracticeSession,
  readScalePracticeHistoryEntry,
  readScalePracticeSession,
} from "@/lib/scalePracticeSession";
import type { ScalePracticeSessionV1 } from "@/lib/scalePracticeTypes";

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
  const searchParams = useSearchParams();
  const [session, setSession] = useState<ScalePracticeSessionV1 | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const wantedId = searchParams.get("id");
      let next = readScalePracticeSession();
      if (wantedId) {
        const fromHistory = readScalePracticeHistoryEntry(wantedId);
        if (fromHistory) {
          // Load into the current-session slot without re-pushing history order
          // beyond a simple bump (persist also records history).
          persistScalePracticeSession(fromHistory);
          next = fromHistory;
        }
      }
      setSession(next);
      setReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, [searchParams]);

  if (!ready) return <ResultsLoading />;

  if (!session) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-24">
        <p className="text-center text-sm text-[var(--musai-muted)]">
          No take yet.
        </p>
        <Link href="/practice/scale" className="musai-btn-primary">
          Scale studio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-12 lg:px-8">
      <ScalePracticeResultsView session={session} />
    </div>
  );
}

export default function ScalePracticeResultsPage() {
  return (
    <Suspense fallback={<ResultsLoading />}>
      <ScalePracticeResultsInner />
    </Suspense>
  );
}
