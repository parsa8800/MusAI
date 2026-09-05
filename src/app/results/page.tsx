"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IntonationResultsView } from "@/components/IntonationResultsView";
import {
  clearIntonationResult,
  readIntonationResult,
  type StoredIntonationResult,
} from "@/lib/musaiResultSession";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<StoredIntonationResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const data = readIntonationResult();
      setResult(data);
      setReady(true);
      if (!data) {
        router.replace("/practice/single-note");
      }
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  const goSetup = () => {
    clearIntonationResult();
    router.push("/practice/single-note");
  };

  if (!ready) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-5 pb-24 pt-14 sm:px-8">
        <div
          className="h-12 w-12 rounded-full border-2 border-white/[0.08] border-t-emerald-400/75 motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <p className="mt-6 text-sm text-zinc-500">Loading results</p>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <header className="mb-9 w-full max-w-md text-center sm:mb-11">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400/85">
          Results
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Intonation
        </h1>
      </header>

      <IntonationResultsView result={result} onTryAgain={goSetup} />
    </div>
  );
}
