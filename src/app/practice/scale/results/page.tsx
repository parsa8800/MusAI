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
        className="h-12 w-12 rounded-full border-2 border-white/[0.08] border-t-sky-400/75 motion-safe:animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      <p className="mt-6 text-sm text-zinc-500">Loading…</p>
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
        <p className="text-center text-sm text-zinc-500">
          No scale session found. Run an analysis from scale practice first.
        </p>
        <Link
          href="/practice/scale"
          className="rounded-full border border-white/[0.1] bg-white/[0.05] px-5 py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/[0.08] active:scale-[0.98]"
        >
          Scale practice
        </Link>
        <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">
          Change exercise
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-24 pt-14 sm:px-8">
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
