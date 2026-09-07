"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IntonationResultsView } from "@/components/IntonationResultsView";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import {
  clearIntonationResult,
  readIntonationResult,
  type StoredIntonationResult,
} from "@/lib/musaiResultSession";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<StoredIntonationResult | null>(() =>
    typeof window === "undefined" ? null : readIntonationResult(),
  );
  const [ready, setReady] = useState(() => typeof window !== "undefined");

  useEffect(() => {
    const data = readIntonationResult();
    setResult(data);
    setReady(true);
    if (!data) {
      router.replace("/practice/single-note");
    }
  }, [router]);

  const goSetup = () => {
    clearIntonationResult();
    router.push("/practice/single-note");
  };

  if (!ready || !result) {
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

  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pt-12">
      <div className="w-full max-w-[460px]">
        <PracticeHubBackLink
          href="/practice/single-note"
          label="Tuning trainer"
          ariaLabel="Back to Tuning trainer"
        />
        <header className="mb-8 text-center sm:mb-9">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--musai-ink)] sm:text-3xl">
            Results
          </h1>
        </header>
        <IntonationResultsView result={result} onTryAgain={goSetup} />
      </div>
    </div>
  );
}
