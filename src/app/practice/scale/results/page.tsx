"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ScalePracticeResultsView } from "@/components/ScalePracticeResultsView";
import { readScalePracticeSession } from "@/lib/scalePracticeSession";

function subscribe() {
  return () => {};
}

export default function ScalePracticeResultsPage() {
  const session = useSyncExternalStore(
    subscribe,
    () => readScalePracticeSession(),
    () => null,
  );

  if (!session) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-24">
        <p className="text-center text-sm text-zinc-500">
          No scale session found. Run an analysis from scale practice first.
        </p>
        <Link
          href="/practice/scale"
          className="rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.1]"
        >
          Go to scale practice
        </Link>
        <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">
          Home
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
