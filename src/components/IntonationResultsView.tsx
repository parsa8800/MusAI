"use client";

import { useEffect, useState } from "react";
import { ScoreRing } from "@/components/ScoreRing";
import { verdictSummary } from "@/lib/intonation";
import type { StoredIntonationResult } from "@/lib/musaiResultSession";

function titleCaseVerdict(label: string): string {
  return label
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pill label + accent: only |cents| ≤ band reads as “in tune”; flat/sharp are clearly not success green. */
function centsDirectionPill(cents: number): { label: string; className: string } {
  const band = 3;
  if (Math.abs(cents) <= band) {
    return {
      label: "Centered",
      className: "text-emerald-400/95",
    };
  }
  if (cents > 0) {
    return {
      label: "Sharp",
      className: "text-amber-400/95",
    };
  }
  return {
    label: "Flat",
    className: "text-violet-400/95",
  };
}

export type IntonationResultsViewProps = {
  result: StoredIntonationResult;
  onTryAgain: () => void;
};

export function IntonationResultsView({
  result,
  onTryAgain,
}: IntonationResultsViewProps) {
  const [scoreBoot, setScoreBoot] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const delay = mq.matches ? 0 : 940;
    const t = window.setTimeout(() => setScoreBoot(false), delay);
    return () => clearTimeout(t);
  }, []);

  const directionPill = centsDirectionPill(result.cents);
  const verdictTitleClass =
    Math.abs(result.cents) <= 3
      ? "text-white"
      : result.cents > 0
        ? "text-amber-100"
        : "text-violet-100";

  return (
    <div className="w-full max-w-[460px] space-y-8">
      <div
        className={`musai-results-card musai-results-card-breathe space-y-8 rounded-[1.35rem] border border-white/[0.11] bg-white/[0.045] px-6 py-10 text-center shadow-[0_20px_56px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.12)] backdrop-blur-2xl transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:px-10 sm:py-12 ${
          !scoreBoot ? "musai-results-ready" : ""
        } hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-[0_28px_72px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] motion-reduce:hover:translate-y-0`}
      >
        <div className="relative mx-auto flex justify-center pt-1">
          <div
            className="pointer-events-none absolute -inset-6 rounded-full opacity-60 blur-3xl motion-reduce:opacity-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(250,204,21,0.12) 0%, rgba(16,185,129,0.06) 42%, transparent 68%)",
            }}
            aria-hidden
          />
          <ScoreRing
            score={result.score}
            size={228}
            label="Match"
            resultsMode
            resultsLoading={scoreBoot}
            resultsRevealMs={2480}
          />
        </div>

        <div className="musai-rv-title space-y-2.5 px-1 pt-2">
          <p
            className={`text-[1.35rem] font-semibold leading-snug tracking-tight sm:text-2xl ${verdictTitleClass}`}
          >
            {titleCaseVerdict(result.label)}
          </p>
        </div>

        <div className="musai-rv-body px-1">
          <p className="mx-auto max-w-[320px] text-sm leading-relaxed text-zinc-500">
            {verdictSummary(result.label)}
          </p>
        </div>

        <div className="musai-rv-cents mx-auto flex max-w-sm items-center justify-center gap-5 rounded-2xl border border-white/[0.1] bg-black/22 px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <span className={directionPill.className}>{directionPill.label}</span>
          <span className="h-3 w-px bg-white/15" aria-hidden />
          <span className="tabular-nums text-zinc-400">
            {result.cents >= 0 ? "+" : ""}
            {result.cents.toFixed(1)} cents
          </span>
        </div>

        <details className="musai-rv-details group w-full max-w-sm rounded-2xl border border-white/[0.1] bg-black/25 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors open:bg-black/30">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-zinc-300 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Technical details
              <span className="text-zinc-500 transition group-open:rotate-180">
                ▼
              </span>
            </span>
          </summary>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 border-t border-white/[0.08] px-4 py-4 font-mono text-[11px] leading-relaxed text-zinc-500">
            <dt className="text-zinc-600">Target</dt>
            <dd className="text-right text-zinc-400">
              {result.targetNoteLabel} at {result.targetHz.toFixed(2)} Hz
            </dd>
            <dt className="text-zinc-600">Detected</dt>
            <dd className="text-right text-zinc-400">
              {result.detectedHz.toFixed(2)} Hz
            </dd>
            <dt className="text-zinc-600">Offset</dt>
            <dd className="text-right text-zinc-400">
              {result.cents >= 0 ? "+" : ""}
              {result.cents.toFixed(2)} cents
            </dd>
            <dt className="text-zinc-600">Model score</dt>
            <dd className="text-right text-zinc-400">{result.score}%</dd>
            <dt className="text-zinc-600">Sample rate</dt>
            <dd className="text-right text-zinc-400">
              {Math.round(result.sampleRateHz)} Hz
            </dd>
            <dt className="text-zinc-600">Windows</dt>
            <dd className="text-right text-zinc-400">
              {result.validFrames} clear of {result.totalFrames} total
            </dd>
          </dl>
        </details>

        <div className="musai-rv-actions flex justify-center pt-1">
          <button
            type="button"
            onClick={onTryAgain}
            className="w-full max-w-xs rounded-full border border-emerald-400/25 bg-gradient-to-b from-emerald-400 to-emerald-600 py-3.5 text-sm font-semibold text-zinc-950 shadow-[0_8px_28px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:from-emerald-300 hover:to-emerald-500 sm:min-w-[220px] sm:py-3"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
