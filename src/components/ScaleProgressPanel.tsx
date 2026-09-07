"use client";

import { useEffect, useState } from "react";
import {
  formatLastPractised,
  listScaleProgressJourneys,
  removeScaleProgressJourney,
  type ScaleProgressJourneyV1,
} from "@/lib/scaleProgressHistory";
import { workspaceTitle } from "@/lib/scaleWorkspace";

function bestTone(best: number): {
  row: string;
  best: string;
  dot: string;
} {
  if (best >= 85) {
    return {
      row: "border-[color-mix(in_srgb,var(--musai-ok)_28%,var(--musai-border))] bg-[var(--musai-accent-soft)] hover:brightness-[0.98]",
      best: "text-[var(--musai-ok)]",
      dot: "bg-[var(--musai-ok)]",
    };
  }
  if (best >= 60) {
    return {
      row: "border-[color-mix(in_srgb,var(--musai-warn)_28%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-warn)_10%,white)] hover:brightness-[0.98]",
      best: "text-[var(--musai-warn)]",
      dot: "bg-[var(--musai-warn)]",
    };
  }
  return {
    row: "border-[color-mix(in_srgb,var(--musai-accent-2)_28%,var(--musai-border))] bg-[color-mix(in_srgb,var(--musai-accent-2)_10%,white)] hover:brightness-[0.98]",
    best: "text-[var(--musai-accent-2)]",
    dot: "bg-[var(--musai-accent-2)]",
  };
}

function AttemptSpark({ attempts }: { attempts: ScaleProgressJourneyV1["attempts"] }) {
  const recent = attempts.slice(-6);
  if (recent.length < 2) return null;
  return (
    <div
      className="mt-1.5 flex items-end justify-center gap-0.5"
      aria-hidden
      title={recent.map((a) => `${Math.round(a.summary.inTunePercent)}%`).join(" → ")}
    >
      {recent.map((a) => {
        const pct = Math.max(8, Math.min(100, a.summary.inTunePercent));
        return (
          <span
            key={a.sessionId}
            className="w-1 rounded-full bg-[color-mix(in_srgb,var(--musai-accent)_45%,var(--musai-border))]"
            style={{ height: `${6 + (pct / 100) * 14}px` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Scale journeys from local progress history — one row per scale, not per take.
 */
export function ScaleProgressPanel({
  revision = 0,
  onContinue,
}: {
  /** Bump after new attempts so the list refreshes. */
  revision?: number;
  onContinue: (journey: ScaleProgressJourneyV1) => void;
}) {
  const [journeys, setJourneys] = useState<ScaleProgressJourneyV1[] | null>(
    null,
  );

  useEffect(() => {
    setJourneys(listScaleProgressJourneys());
  }, [revision]);

  if (!journeys || journeys.length === 0) return null;

  return (
    <section
      className="w-full rounded-[var(--musai-radius-lg)] border border-[var(--musai-border)] bg-[var(--musai-surface)] px-3.5 py-3.5 shadow-[var(--musai-shadow)] sm:px-4"
      aria-label="Scale progress"
    >
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--musai-muted)]">
          Progress
        </p>
      </div>
      <ul className="mt-3 max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto">
        {journeys.map((j) => {
          const best = Math.round(j.bestInTunePercent);
          const tone = bestTone(best);
          const attemptLabel =
            j.attempts.length === 1
              ? "1 attempt"
              : `${j.attempts.length} attempts`;
          return (
            <li key={j.progressKey} className="group relative">
              <button
                type="button"
                className={`flex w-full flex-col items-center gap-0.5 rounded-[var(--musai-radius)] border px-3 py-2.5 pr-7 text-center transition-colors duration-200 ${tone.row}`}
                onClick={() => onContinue(j)}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                    aria-hidden
                  />
                  <span className="truncate text-[13px] font-semibold text-[var(--musai-ink)]">
                    {workspaceTitle(j.scaleLabel, j.lastOctaveSpan)}
                  </span>
                </span>
                <span className={`text-[12px] font-medium tabular-nums ${tone.best}`}>
                  Best accuracy {best}%
                </span>
                <span className="text-[10px] text-[var(--musai-muted)]">
                  {attemptLabel}
                  <span className="mx-1 text-[var(--musai-border)]">·</span>
                  {formatLastPractised(j.lastPractisedAt)}
                </span>
                <AttemptSpark attempts={j.attempts} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${j.scaleLabel} progress`}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--musai-surface-2)] text-[var(--musai-muted)] opacity-100 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--musai-accent-2)_18%,white)] hover:text-[var(--musai-accent-2)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--musai-accent-2)] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeScaleProgressJourney(j.progressKey);
                  setJourneys(listScaleProgressJourneys());
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  aria-hidden
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
