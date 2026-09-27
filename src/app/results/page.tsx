"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IntonationResultsView } from "@/components/IntonationResultsView";
import { MusaiLoadingScreen } from "@/components/MusaiLoadingMark";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import {
  clearIntonationResult,
  readIntonationResult,
  type StoredIntonationResult,
} from "@/lib/musaiResultSession";

export default function ResultsPage() {
  const router = useRouter();
  // Always start empty so SSR and the first client paint match.
  const [result, setResult] = useState<StoredIntonationResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const data = readIntonationResult();
      setResult(data);
      setReady(true);
      if (!data) {
        router.replace("/practice/single-note");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [router]);

  const goSetup = () => {
    clearIntonationResult();
    router.push("/practice/single-note");
  };

  if (!ready || !result) {
    return (
      <MusaiLoadingScreen label="Loading" />
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
