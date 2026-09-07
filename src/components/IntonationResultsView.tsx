"use client";

import Link from "next/link";
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
      className: "text-[var(--musai-ok)]",
    };
  }
  if (cents > 0) {
    return {
      label: "Sharp",
      className: "text-[var(--musai-warn)]",
    };
  }
  return {
    label: "Flat",
    className: "text-[var(--musai-accent)]",
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
      ? "text-[var(--musai-ink)]"
      : result.cents > 0
        ? "text-[var(--musai-warn)]"
        : "text-[var(--musai-accent)]";

  return (
    <div className="w-full max-w-[460px] space-y-8">
      <div
        className={`musai-results-card musai-results-card-breathe musai-glass-panel space-y-8 px-6 py-10 text-center sm:px-10 sm:py-12 ${
          !scoreBoot ? "musai-results-ready" : ""
        }`}
      >
        <div className="relative mx-auto flex justify-center pt-1">
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
            className={`font-display text-[1.35rem] font-semibold leading-snug tracking-tight sm:text-2xl ${verdictTitleClass}`}
          >
            {titleCaseVerdict(result.label)}
          </p>
        </div>

        <div className="musai-rv-body px-1">
          <p className="mx-auto max-w-[320px] text-[15px] leading-relaxed text-[var(--musai-ink)]">
            {verdictSummary(result.label)}
          </p>
        </div>

        <details className="musai-rv-details group w-full max-w-sm musai-glass-inset text-left">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-medium text-[var(--musai-muted)] marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              Technical details
              <span className="text-[var(--musai-muted)] transition group-open:rotate-180">
                ▼
              </span>
            </span>
          </summary>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 border-t border-[var(--musai-border)] px-4 py-4 text-[11px] leading-relaxed text-[var(--musai-muted)]">
            <dt>Direction</dt>
            <dd className={`text-right ${directionPill.className}`}>
              {directionPill.label}
            </dd>
            <dt>Offset</dt>
            <dd className="text-right tabular-nums">
              {result.cents >= 0 ? "+" : ""}
              {result.cents.toFixed(2)} cents
            </dd>
            <dt>Target</dt>
            <dd className="text-right tabular-nums">
              {result.targetNoteLabel} at {result.targetHz.toFixed(2)} Hz
            </dd>
            <dt>Detected</dt>
            <dd className="text-right tabular-nums">
              {result.detectedHz.toFixed(2)} Hz
            </dd>
            <dt>Model score</dt>
            <dd className="text-right tabular-nums">{result.score}%</dd>
            <dt>Sample rate</dt>
            <dd className="text-right tabular-nums">
              {Math.round(result.sampleRateHz)} Hz
            </dd>
            <dt>Windows</dt>
            <dd className="text-right tabular-nums">
              {result.validFrames} clear of {result.totalFrames} total
            </dd>
          </dl>
        </details>

        <div className="musai-rv-actions flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onTryAgain}
            className="musai-btn-primary"
          >
            Retry
          </button>
          <Link href="/" className="musai-btn-secondary">
            Practice hub
          </Link>
        </div>
      </div>
    </div>
  );
}
